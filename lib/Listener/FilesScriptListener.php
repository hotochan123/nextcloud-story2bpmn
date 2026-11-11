<?php

declare(strict_types=1);

namespace OCA\Story2Bpmn\Listener;

use OCA\Story2Bpmn\AppInfo\Application;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Loads the file action "Open in Story2BPMN" for .bpmn files into the Files app.
 *
 * @template-implements IEventListener<Event>
 */
class FilesScriptListener implements IEventListener {
    public function handle(Event $event): void {
        if (!is_a($event, 'OCA\\Files\\Event\\LoadAdditionalScriptsEvent')) {
            return;
        }
        Util::addInitScript(Application::APP_ID, Application::APP_ID . '-files');
        Util::addTranslations(Application::APP_ID);
    }
}
