<?php

declare(strict_types=1);

namespace OCA\Story2Bpmn\Tests\Unit\Service;

use OCA\Story2Bpmn\Service\WorkingFileException;
use OCA\Story2Bpmn\Service\WorkingFileService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class WorkingFileServiceTest extends TestCase {
    private const XML = '<?xml version="1.0"?><bpmn:definitions/>';

    /** @var array<int, Node> nodes of alice's folder by id */
    private array $nodes = [];
    private Folder&MockObject $home;
    private WorkingFileService $service;

    protected function setUp(): void {
        $this->home = $this->createMock(Folder::class);
        $this->home->method('getFirstNodeById')->willReturnCallback(fn (int $id) => $this->nodes[$id] ?? null);
        $this->home->method('getRelativePath')->willReturnCallback(fn (string $p) => substr($p, strlen('/alice/files')));
        $root = $this->createMock(IRootFolder::class);
        // only alice has files; any other account sees an empty folder
        $empty = $this->createMock(Folder::class);
        $root->method('getUserFolder')->willReturnCallback(fn (string $uid) => $uid === 'alice' ? $this->home : $empty);
        $this->service = new WorkingFileService($root);
    }

    private function file(int $id, string $name = 'order.bpmn', string $etag = 'e1', bool $updateable = true, int $size = 40, string $content = self::XML): File&MockObject {
        $f = $this->createMock(File::class);
        $f->method('getId')->willReturn($id);
        $f->method('getName')->willReturn($name);
        $f->method('getPath')->willReturn('/alice/files/Processes/' . $name);
        $f->method('getEtag')->willReturn($etag);
        $f->method('getMTime')->willReturn(1700000000);
        $f->method('getSize')->willReturn($size);
        $f->method('isReadable')->willReturn(true);
        $f->method('isUpdateable')->willReturn($updateable);
        $f->method('getContent')->willReturn($content);
        return $this->nodes[$id] = $f;
    }

    private function folder(int $id, bool $creatable = true, array $existing = []): Folder&MockObject {
        $d = $this->createMock(Folder::class);
        $d->method('getId')->willReturn($id);
        $d->method('isReadable')->willReturn(true);
        $d->method('isCreatable')->willReturn($creatable);
        $d->method('nodeExists')->willReturnCallback(fn (string $n) => in_array($n, $existing, true));
        return $this->nodes[$id] = $d;
    }

    private function refused(int $status, callable $call): WorkingFileException {
        try {
            $call();
        } catch (WorkingFileException $e) {
            $this->assertSame($status, $e->getStatus());
            return $e;
        }
        $this->fail("expected status $status");
    }

    public function testReadReturnsContentAndMetadata(): void {
        $this->file(7);
        $r = $this->service->read('alice', 7);
        $this->assertSame(['id' => 7, 'name' => 'order.bpmn', 'path' => '/Processes/order.bpmn', 'etag' => 'e1',
            'hash' => hash('sha256', self::XML), 'mtime' => 1700000000, 'canSave' => true, 'content' => self::XML], $r);
    }

    public function testReadOfForeignOrMissingIdIsNotFound(): void {
        $this->file(7);
        $this->refused(404, fn () => $this->service->read('bob', 7));
        $this->refused(404, fn () => $this->service->read('alice', 99));
    }

    public function testReadOfFolderOrOtherFileIsInvalid(): void {
        $this->folder(3);
        $this->file(8, 'notes.txt');
        $this->refused(400, fn () => $this->service->read('alice', 3));
        $this->refused(400, fn () => $this->service->read('alice', 8));
    }

    public function testUpperCaseExtensionIsAWorkingFile(): void {
        $this->file(9, 'ORDER.BPMN');
        $this->assertSame('ORDER.BPMN', $this->service->read('alice', 9)['name']);
    }

    public function testReadOfLargeFileIsRefused(): void {
        $f = $this->file(7, size: WorkingFileService::MAX_BYTES + 1);
        $f->expects($this->never())->method('getContent');
        $this->refused(413, fn () => $this->service->read('alice', 7));
    }

    private static function h(string $c = self::XML): string {
        return hash('sha256', $c);
    }

    public function testWriteWithMatchingEtagAndHashWrites(): void {
        $f = $this->file(7);
        $f->expects($this->once())->method('putContent')->with('<new/>');
        $r = $this->service->write('alice', 7, '<new/>', 'e1', false, self::h());
        $this->assertSame('e1', $r['etag']);
        $this->assertSame(self::h('<new/>'), $r['hash']);
    }

    public function testWriteWithOldEtagIsAConflictWithoutWriting(): void {
        $f = $this->file(7, etag: 'e2');
        $f->expects($this->never())->method('putContent');
        $e = $this->refused(409, fn () => $this->service->write('alice', 7, '<new/>', 'e1', false, self::h()));
        $this->assertSame(['etag' => 'e2', 'mtime' => 1700000000], $e->getData());
        $this->refused(409, fn () => $this->service->write('alice', 7, '<new/>', null, false, self::h()));
    }

    public function testOutsideChangeWithUnchangedEtagIsAConflict(): void {
        // Etag still the loaded one (stale file cache, same second), but the content is another.
        $f = $this->file(7, content: '<from-a-modeler/>');
        $f->expects($this->never())->method('putContent');
        $this->refused(409, fn () => $this->service->write('alice', 7, '<new/>', 'e1', false, self::h()));
    }

    public function testMissingOrBadHashIsAConflict(): void {
        $f = $this->file(7);
        $f->expects($this->never())->method('putContent');
        $this->refused(409, fn () => $this->service->write('alice', 7, '<new/>', 'e1', false));
        $this->refused(409, fn () => $this->service->write('alice', 7, '<new/>', 'e1', false, ['x']));
        $this->refused(409, fn () => $this->service->write('alice', 7, '<new/>', 'e1', false, ''));
    }

    public function testFileNowTooLargeIsAConflictWithoutReading(): void {
        $f = $this->file(7, size: WorkingFileService::MAX_BYTES + 1);
        $f->expects($this->never())->method('getContent');
        $f->expects($this->never())->method('putContent');
        $this->refused(409, fn () => $this->service->write('alice', 7, '<new/>', 'e1', false, self::h()));
    }

    public function testForcedWriteOverwrites(): void {
        $f = $this->file(7, etag: 'e2');
        $f->expects($this->once())->method('putContent');
        $this->service->write('alice', 7, '<new/>', 'e1', true);
    }

    public function testWriteOfReadOnlyFileIsForbidden(): void {
        $f = $this->file(7, updateable: false);
        $f->expects($this->never())->method('putContent');
        $this->refused(403, fn () => $this->service->write('alice', 7, '<new/>', 'e1', false, self::h()));
    }

    public function testWriteChecksContentAndOwner(): void {
        $this->file(7);
        $this->refused(400, fn () => $this->service->write('alice', 7, ['x'], 'e1', false));
        $this->refused(413, fn () => $this->service->write('alice', 7, str_repeat('x', WorkingFileService::MAX_BYTES + 1), 'e1', false));
        $this->refused(404, fn () => $this->service->write('bob', 7, '<new/>', 'e1', true));
    }

    public function testCreateAddsExtensionAndWrites(): void {
        $d = $this->folder(3);
        $d->expects($this->once())->method('newFile')->with('Order intake.bpmn', '<x/>')
            ->willReturnCallback(fn () => $this->file(11, 'Order intake.bpmn'));
        $r = $this->service->create('alice', 3, '  Order intake ', '<x/>');
        $this->assertSame(11, $r['id']);
        $this->assertSame('/Processes/Order intake.bpmn', $r['path']);
    }

    public function testCreateNeverOverwritesAnExistingName(): void {
        $d = $this->folder(3, existing: ['order.bpmn']);
        $d->expects($this->never())->method('newFile');
        $e = $this->refused(409, fn () => $this->service->create('alice', 3, 'order.bpmn', '<x/>'));
        $this->assertSame(['exists' => true], $e->getData());
    }

    public function testCreateInForeignOrMissingFolderIsNotFound(): void {
        $this->folder(3);
        $this->file(7);
        $this->refused(404, fn () => $this->service->create('bob', 3, 'a', '<x/>'));
        $this->refused(404, fn () => $this->service->create('alice', 7, 'a', '<x/>'));
        $this->refused(404, fn () => $this->service->create('alice', 99, 'a', '<x/>'));
    }

    public function testCreateInReadOnlyFolderIsForbidden(): void {
        $d = $this->folder(3, creatable: false);
        $d->expects($this->never())->method('newFile');
        $this->refused(403, fn () => $this->service->create('alice', 3, 'a', '<x/>'));
    }

    /** @return array<string, array{mixed}> */
    public static function badNames(): array {
        return [
            'empty' => [''],
            'blank' => ['   '],
            'only extension' => ['.bpmn'],
            'parent' => ['../x.bpmn'],
            'slash' => ['a/b.bpmn'],
            'backslash' => ['a\\b'],
            'hidden' => ['.htaccess'],
            'null byte' => ["a\0b.bpmn"],
            'newline' => ["a\nb"],
            'too long' => [str_repeat('a', 300)],
            'not a string' => [42],
            'invalid utf-8' => ["\xff\xfe"],
        ];
    }

    #[DataProvider('badNames')]
    public function testBadNamesAreInvalid(mixed $name): void {
        $d = $this->folder(3);
        $d->expects($this->never())->method('newFile');
        $this->refused(400, fn () => $this->service->create('alice', 3, $name, '<x/>'));
    }

    public function testFileNameKeepsAnExistingExtension(): void {
        $this->assertSame('Ablauf.BPMN', WorkingFileService::fileName('Ablauf.BPMN'));
        $this->assertSame('Rechnung – Eingang.bpmn', WorkingFileService::fileName('Rechnung – Eingang'));
    }

    // Reading copy

    private const PDF = "%PDF-1.7\n%\xe2\xe3\n1 0 obj<<>>endobj\n%%EOF";

    /** order.bpmn (id 7) in folder 3, whose existing nodes are given by name. */
    private function beside(array $existing = [], bool $creatable = true, string $name = 'order.bpmn'): Folder&MockObject {
        $d = $this->folder(3, $creatable, array_keys($existing));
        $d->method('get')->willReturnCallback(fn (string $n) => $existing[$n]);
        $f = $this->file(7, $name);
        $f->method('getParent')->willReturn($d);
        return $d;
    }

    private function pdfFile(int $id, bool $updateable = true): File&MockObject {
        $p = $this->createMock(File::class);
        $p->method('getId')->willReturn($id);
        $p->method('getPath')->willReturn('/alice/files/Processes/order.pdf');
        $p->method('isUpdateable')->willReturn($updateable);
        return $p;
    }

    public function testPublishCreatesThePdfBesideTheWorkingFile(): void {
        $d = $this->beside();
        $d->expects($this->once())->method('newFile')->with('order.pdf', self::PDF)->willReturn($this->pdfFile(12));
        $r = $this->service->publish('alice', 7, base64_encode(self::PDF));
        $this->assertSame(['id' => 12, 'name' => 'order.pdf', 'path' => '/Processes/order.pdf', 'replaced' => false], $r);
    }

    public function testPublishReplacesAnExistingPdfAsNewVersion(): void {
        $p = $this->pdfFile(12);
        $p->expects($this->once())->method('putContent')->with(self::PDF);
        $d = $this->beside(['order.pdf' => $p]);
        $d->expects($this->never())->method('newFile');
        $r = $this->service->publish('alice', 7, base64_encode(self::PDF));
        $this->assertSame(12, $r['id']);
        $this->assertTrue($r['replaced']);
    }

    public function testPublishNameFollowsAnUpperCaseExtension(): void {
        $d = $this->beside(name: 'ORDER.BPMN');
        $d->expects($this->once())->method('newFile')->with('ORDER.pdf')->willReturn($this->pdfFile(12));
        $this->assertSame('ORDER.pdf', $this->service->publish('alice', 7, base64_encode(self::PDF))['name']);
    }

    /** @return array<string, array{mixed, int}> */
    public static function badPdfs(): array {
        return [
            'not a string' => [['x'], 400],
            'empty' => ['', 400],
            'html' => [base64_encode('<html><script>alert(1)</script></html>'), 400],
            'not base64' => ['%PDF-1.7 raw', 400],
            'too large' => [str_repeat('A', intdiv(WorkingFileService::MAX_PDF_BYTES + 2, 3) * 4 + 4), 413],
        ];
    }

    #[DataProvider('badPdfs')]
    public function testPublishRefusesWhatIsNoPdf(mixed $content, int $status): void {
        $d = $this->beside();
        $d->expects($this->never())->method('newFile');
        $this->refused($status, fn () => $this->service->publish('alice', 7, $content));
    }

    public function testPublishWithAFolderInTheWayIsAConflict(): void {
        $d = $this->beside(['order.pdf' => $this->createMock(Folder::class)]);
        $d->expects($this->never())->method('newFile');
        $this->refused(409, fn () => $this->service->publish('alice', 7, base64_encode(self::PDF)));
    }

    public function testPublishOverAReadOnlyPdfIsForbidden(): void {
        $p = $this->pdfFile(12, updateable: false);
        $p->expects($this->never())->method('putContent');
        $this->beside(['order.pdf' => $p]);
        $this->refused(403, fn () => $this->service->publish('alice', 7, base64_encode(self::PDF)));
    }

    public function testPublishInAFolderWithoutCreateRightIsForbidden(): void {
        $d = $this->beside(creatable: false);
        $d->expects($this->never())->method('newFile');
        $this->refused(403, fn () => $this->service->publish('alice', 7, base64_encode(self::PDF)));
    }

    public function testPublishOfForeignMissingOrOtherFileIsRefused(): void {
        $this->beside();
        $this->file(8, 'notes.txt');
        $this->refused(404, fn () => $this->service->publish('bob', 7, base64_encode(self::PDF)));
        $this->refused(404, fn () => $this->service->publish('alice', 99, base64_encode(self::PDF)));
        $this->refused(400, fn () => $this->service->publish('alice', 8, base64_encode(self::PDF)));
    }
}
