# The tool is a workshop, not a process portal

Settled on 11 Sep 2026. Collaboration is asynchronous: an author builds the draft, the involved parties contribute changes, and the process owner approves. The obvious move would have been to model this flow in the tool (versions, proposals, an approval workflow, a reading view for all employees).

The decision went the other way: the tool covers only the conversion: process description in, draft out, refine in conversation with the AI, out as a BPMN working file and as PDF/image. Approval, versions and proposals happen outside; people look things up in the CRM, to which the approved version is transferred by hand. Reason: this workflow part is a standard feature of finished process management products (ADONIS, SAP Signavio, ARIS) and would be by far the biggest chunk to build ourselves, with no value of its own.

## Consequences

- The tool stores nothing itself: no database, no backup. The BPMN working file is the original and is kept in the CRM.
- Because the original lives elsewhere, the tool must be able to **read back** its own BPMN files; otherwise stable position retention would be limited to the first session.
- Copies in the CRM can become outdated. The state "approved but not transferred" is deliberately carried by the organization, not enforced technically.
- Operation as a web page in the company network with sign-in through the company account; the start therefore depends on three commitments from IT: an allowed AI provider, a server, sign-in.
