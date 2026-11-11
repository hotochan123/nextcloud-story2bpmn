<?php

declare(strict_types=1);

namespace OCA\Story2Bpmn\Tests\Unit\Controller;

use OCA\Story2Bpmn\Controller\FileController;
use OCA\Story2Bpmn\Service\WorkingFileException;
use OCA\Story2Bpmn\Service\WorkingFileService;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class FileControllerTest extends TestCase {
    private WorkingFileService&MockObject $service;
    private IUserSession&MockObject $session;
    private FileController $controller;

    protected function setUp(): void {
        $this->service = $this->createMock(WorkingFileService::class);
        $this->session = $this->createMock(IUserSession::class);
        $l = $this->createMock(IL10N::class);
        $l->method('t')->willReturnCallback(fn (string $s) => "[$s]");
        $this->controller = new FileController($this->createMock(IRequest::class), $this->service, $this->session, $l);
    }

    private function login(string $uid): void {
        $u = $this->createMock(IUser::class);
        $u->method('getUID')->willReturn($uid);
        $this->session->method('getUser')->willReturn($u);
    }

    public function testWithoutLoginIsUnauthorized(): void {
        $this->service->expects($this->never())->method('read');
        $r = $this->controller->show(7);
        $this->assertSame(401, $r->getStatus());
    }

    public function testShowPassesTheAccount(): void {
        $this->login('alice');
        $this->service->expects($this->once())->method('read')->with('alice', 7)->willReturn(['id' => 7]);
        $r = $this->controller->show(7);
        $this->assertSame(200, $r->getStatus());
        $this->assertSame(['id' => 7], $r->getData());
    }

    public function testConflictKeepsStatusTranslatedMessageAndData(): void {
        $this->login('alice');
        $this->service->method('write')->willThrowException(
            new WorkingFileException(409, 'The file was changed elsewhere since you opened it.', ['etag' => 'e2', 'mtime' => 1]));
        $r = $this->controller->update(7, '<x/>', 'e1');
        $this->assertSame(409, $r->getStatus());
        $this->assertSame(['message' => '[The file was changed elsewhere since you opened it.]', 'etag' => 'e2', 'mtime' => 1], $r->getData());
    }

    public function testForceOnlyWhenTrue(): void {
        $this->login('alice');
        $calls = [];
        $this->service->method('write')->willReturnCallback(function ($uid, $id, $c, $e, bool $force) use (&$calls) {
            $calls[] = $force;
            return [];
        });
        $this->controller->update(7, '<x/>', 'e1', true);
        $this->controller->update(7, '<x/>', 'e1', 'yes');
        $this->controller->update(7, '<x/>', 'e1');
        $this->assertSame([true, false, false], $calls);
    }

    public function testHashIsPassedOn(): void {
        $this->login('alice');
        $this->service->expects($this->once())->method('write')->with('alice', 7, '<x/>', 'e1', false, 'h1')->willReturn([]);
        $this->controller->update(7, '<x/>', 'e1', false, 'h1');
    }

    public function testCreateAnswers201(): void {
        $this->login('alice');
        $this->service->expects($this->once())->method('create')->with('alice', 3, 'a', '<x/>')->willReturn(['id' => 11]);
        $this->assertSame(201, $this->controller->create(3, 'a', '<x/>')->getStatus());
    }

    public function testPublishPassesAccountAndContent(): void {
        $this->login('alice');
        $this->service->expects($this->once())->method('publish')->with('alice', 7, 'UERG')->willReturn(['id' => 12]);
        $r = $this->controller->publish(7, 'UERG');
        $this->assertSame(200, $r->getStatus());
        $this->assertSame(['id' => 12], $r->getData());
    }

    public function testPublishRefusalKeepsStatusAndTranslatedMessage(): void {
        $this->login('alice');
        $this->service->method('publish')->willThrowException(
            new WorkingFileException(409, 'A folder with the name of the reading copy is in the way.'));
        $r = $this->controller->publish(7, 'x');
        $this->assertSame(409, $r->getStatus());
        $this->assertSame(['message' => '[A folder with the name of the reading copy is in the way.]'], $r->getData());
    }

    public function testPublishWithoutLoginIsUnauthorized(): void {
        $this->service->expects($this->never())->method('publish');
        $this->assertSame(401, $this->controller->publish(7, 'x')->getStatus());
    }
}
