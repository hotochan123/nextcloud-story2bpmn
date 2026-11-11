import { ProcessIR, Op } from '../../src/core/ir.js';

export const baseProcess = (): ProcessIR => ({
  id: 'Rechnungsfreigabe',
  name: 'Rechnungsfreigabe',
  version: 1,
  lanes: [
    { id: 'Lane_buha', name: 'Buchhaltung' },
    { id: 'Lane_fk', name: 'Führungskraft' }
  ],
  nodes: [
    { id: 'Start_1', kind: 'start', name: 'Rechnung eingegangen', laneId: 'Lane_buha' },
    {
      id: 'Task_pruefen',
      kind: 'step',
      name: 'Rechnung prüfen',
      laneId: 'Lane_buha',
      details: {
        system: 'SAP',
        documents: ['Rechnung'],
        description: 'Formal und rechnerisch prüfen.',
        deadline: 'innerhalb von 3 Arbeitstagen'
      }
    },
    {
      id: 'Task_zahlen',
      kind: 'step',
      name: 'Zahlung anweisen',
      laneId: 'Lane_buha',
      details: { system: 'Online-Banking' }
    },
    { id: 'End_1', kind: 'end', name: 'Bezahlt', laneId: 'Lane_buha' }
  ],
  edges: [
    { id: 'f_Start_1__Task_pruefen', from: 'Start_1', to: 'Task_pruefen' },
    { id: 'f_Task_pruefen__Task_zahlen', from: 'Task_pruefen', to: 'Task_zahlen' },
    { id: 'f_Task_zahlen__End_1', from: 'Task_zahlen', to: 'End_1' }
  ]
});

/**
 * What a language model is supposed to output for the prompt
 * "ab 5000 Euro braucht es eine Freigabe durch die Führungskraft, und"
 * "abgelehnte Zahlungen sollen als Klärfall bei der Buchhaltung landen".
 * Handwritten, so the core can be tested without AI.
 */
export const changeOps: Op[] = [
  {
    op: 'insertBetween',
    fromId: 'Task_pruefen',
    toId: 'Task_zahlen',
    node: {
      id: 'Gateway_betrag',
      kind: 'gateway',
      gatewayType: 'exclusive',
      name: 'Betrag über 5000 Euro?',
      laneId: 'Lane_buha'
    }
  },
  {
    op: 'addBranch',
    gatewayId: 'Gateway_betrag',
    joinAt: 'Task_zahlen',
    condition: 'ja',
    nodes: [
      {
        id: 'Task_freigabe',
        kind: 'step',
        name: 'Vier-Augen-Freigabe',
        laneId: 'Lane_fk',
        details: { description: 'Führungskraft gibt die Zahlung frei.' }
      }
    ]
  },
  { op: 'setEdge', fromId: 'Gateway_betrag', toId: 'Task_zahlen', isDefault: true, name: 'nein' },
  {
    op: 'attachException',
    nodeId: 'Task_zahlen',
    event: {
      id: 'Exception_abgelehnt',
      kind: 'exception',
      name: 'Zahlung abgelehnt',
      attachedTo: 'Task_zahlen',
      trigger: 'error'
    }
  },
  {
    op: 'insertAfter',
    afterId: 'Exception_abgelehnt',
    node: {
      id: 'Task_klaerfall',
      kind: 'step',
      name: 'Klärfall bearbeiten',
      laneId: 'Lane_buha',
      details: { documents: ['Klärfallakte'] }
    }
  },
  { op: 'connect', fromId: 'Task_klaerfall', toId: 'End_1' }
];

/**
 * What a language model is supposed to output for a process description without an
 * existing diagram - from scratch, i.e. with addLane and addNode.
 */
export const scratchOps: Op[] = [
  { op: 'addLane', id: 'Lane_vertrieb', name: 'Vertrieb' },
  { op: 'addLane', id: 'Lane_lager', name: 'Lager' },
  {
    op: 'addNode',
    node: { id: 'Start_1', kind: 'start', name: 'Bestellung eingegangen', laneId: 'Lane_vertrieb' }
  },
  {
    op: 'addNode',
    node: {
      id: 'Task_erfassen',
      kind: 'step',
      name: 'Bestellung erfassen',
      laneId: 'Lane_vertrieb',
      details: { system: 'CRM' }
    }
  },
  {
    op: 'addNode',
    node: { id: 'Task_packen', kind: 'step', name: 'Ware packen', laneId: 'Lane_lager' }
  },
  { op: 'addNode', node: { id: 'End_1', kind: 'end', name: 'Versandt', laneId: 'Lane_lager' } },
  { op: 'connect', fromId: 'Start_1', toId: 'Task_erfassen' },
  { op: 'connect', fromId: 'Task_erfassen', toId: 'Task_packen' },
  { op: 'connect', fromId: 'Task_packen', toId: 'End_1' }
];

/** Typical AI slip: a task in a lane that does not exist. */
export const unknownLaneOps: Op[] = [
  {
    op: 'insertAfter',
    afterId: 'Task_zahlen',
    node: {
      id: 'Task_mail',
      kind: 'step',
      name: 'Bestätigung senden',
      laneId: 'Lane_einkauf',
      details: { system: 'Outlook' }
    }
  }
];
