<?php

declare(strict_types=1);

namespace OCA\Story2Bpmn\AppInfo;

use OCA\Story2Bpmn\Listener\FilesScriptListener;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {
    public const APP_ID = 'story2bpmn';

    public function __construct(array $urlParams = []) {
        parent::__construct(self::APP_ID, $urlParams);
    }

    public function register(IRegistrationContext $context): void {
        // the Files app's event class is not part of OCP: registered by name
        $context->registerEventListener('OCA\\Files\\Event\\LoadAdditionalScriptsEvent', FilesScriptListener::class);
    }

    public function boot(IBootContext $context): void {
    }
}
