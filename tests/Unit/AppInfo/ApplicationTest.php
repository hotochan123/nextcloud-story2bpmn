<?php

declare(strict_types=1);

namespace OCA\Story2Bpmn\Tests\Unit\AppInfo;

use OCA\Story2Bpmn\AppInfo\Application;
use PHPUnit\Framework\TestCase;

class ApplicationTest extends TestCase {
    public function testAppIdMatchesInfoXml(): void {
        $this->assertSame('story2bpmn', Application::APP_ID);
        $xml = simplexml_load_file(__DIR__ . '/../../../appinfo/info.xml');
        $this->assertSame(Application::APP_ID, (string)$xml->id);
        $this->assertSame('Story2Bpmn', (string)$xml->namespace);
    }

    public function testClassesLoadUnderNewNamespace(): void {
        foreach ([
            'OCA\\Story2Bpmn\\AppInfo\\Application',
            'OCA\\Story2Bpmn\\Controller\\FileController',
            'OCA\\Story2Bpmn\\Controller\\PageController',
            'OCA\\Story2Bpmn\\Listener\\FilesScriptListener',
            'OCA\\Story2Bpmn\\Service\\WorkingFileService',
        ] as $class) {
            $this->assertTrue(class_exists($class), $class);
        }
    }
}
