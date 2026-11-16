<?php

declare(strict_types=1);

namespace OCA\Story2Bpmn\Tests\Unit\Service;

use OCA\Story2Bpmn\Service\ApprovalCheck;
use OCP\Comments\IComment;
use OCP\Comments\ICommentsManager;
use OCP\Files\File;
use PHPUnit\Framework\TestCase;

/** Job 432: the server confirms a valid version only with Nextcloud's comments (ApprovalCheck). */
class ApprovalCheckTest extends TestCase {
    /** The check code tests/client/approvalTrust.test.ts expects for the same file. */
    private const CODE = '1b9227723fa6df9a';
    private const ASK = '@"petra" Bitte um Freigabe von „Bestellung“.';
    private const APPROVED = '@"jonas" Als Gültige Version 3 freigegeben.' . "\nPrüfkennung: " . self::CODE;

    private static function fixture(): string {
        return (string)file_get_contents(__DIR__ . '/../../core/fixtures/approved-v3.bpmn');
    }

    private static function c(int $id, string $actor, string $message, string $type = 'users'): array {
        return ['id' => $id, 'actorType' => $type, 'actorId' => $actor, 'message' => $message];
    }

    public function testCheckCodeIsTheSameAsTheClients(): void {
        $s = ApprovalCheck::readState(self::fixture());
        $this->assertNotNull($s);
        $this->assertSame('de', $s['language']);
        $this->assertStringContainsString('Müller & Söhne', $s['story']);
        $this->assertStringContainsString('😀', $s['story']);
        $this->assertSame(self::CODE, ApprovalCheck::code(3, 'de', $s['story']));
    }

    public function testConfirmedWithRequestByAnotherAccountThenApproval(): void {
        $s = ApprovalCheck::readState(self::fixture());
        $this->assertTrue(ApprovalCheck::confirms($s, [self::c(2, 'petra', self::APPROVED), self::c(1, 'jonas', self::ASK)]));
        $en = '@"jonas" Approved as valid version 3.' . "\nCheck code: " . self::CODE;
        $this->assertTrue(ApprovalCheck::confirms($s, [self::c(1, 'jonas', '@"petra" Please approve "x".'), self::c(2, 'petra', $en)]));
    }

    public function testNotConfirmed(): void {
        $s = ApprovalCheck::readState(self::fixture());
        $other = str_replace(self::CODE, '0000000000000000', self::APPROVED);
        $cases = [
            'no comments' => [],
            'approval only' => [self::c(2, 'petra', self::APPROVED)],
            'request only' => [self::c(1, 'jonas', self::ASK)],
            'approval by another account' => [self::c(1, 'jonas', self::ASK), self::c(2, 'bob', self::APPROVED)],
            'approval comment of the approver named in the file, written by jonas' => [self::c(1, 'jonas', self::ASK), self::c(2, 'jonas', self::APPROVED)],
            'request by the approver herself' => [self::c(1, 'petra', self::ASK), self::c(2, 'petra', self::APPROVED)],
            'request after the approval' => [self::c(3, 'jonas', self::ASK), self::c(2, 'petra', self::APPROVED)],
            'wrong code' => [self::c(1, 'jonas', self::ASK), self::c(2, 'petra', $other)],
            'other number' => [self::c(1, 'jonas', self::ASK), self::c(2, 'petra', str_replace('Version 3', 'Version 4', self::APPROVED))],
            'not a user' => [self::c(1, 'jonas', self::ASK), self::c(2, 'petra', self::APPROVED, 'guests')],
            'text around it' => [self::c(1, 'jonas', self::ASK), self::c(2, 'petra', 'ok ' . self::APPROVED)],
        ];
        foreach ($cases as $name => $comments) {
            $this->assertFalse(ApprovalCheck::confirms($s, $comments), $name);
        }
    }

    public function testStoryChangedSinceTheApprovalIsNotConfirmed(): void {
        $xml = str_replace('Erledigt', 'Erledigt!', self::fixture());
        $this->assertFalse(ApprovalCheck::confirms(ApprovalCheck::readState($xml), [self::c(1, 'jonas', self::ASK), self::c(2, 'petra', self::APPROVED)]));
        $en = str_replace('xml:lang="de"', 'xml:lang="en"', self::fixture());
        $this->assertFalse(ApprovalCheck::confirms(ApprovalCheck::readState($en), [self::c(1, 'jonas', self::ASK), self::c(2, 'petra', self::APPROVED)]));
    }

    public function testBrokenFilesAreRefused(): void {
        $this->assertNull(ApprovalCheck::readState(''));
        $this->assertNull(ApprovalCheck::readState('<a'));
        $this->assertNull(ApprovalCheck::readState('<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x "y">]><d a="&x;"/>'));
        $state = ['story' => '[]', 'language' => 'de'];
        foreach (['{', '"gueltig"', '{"status":"gueltig"}', '{"status":"gueltig","gueltig":{"nummer":"3","von":{"uid":"petra"}}}', '{"status":"gueltig","gueltig":{"nummer":3,"von":{"uid":7}}}'] as $raw) {
            $this->assertFalse(ApprovalCheck::confirms($state + ['approval' => $raw], [self::c(1, 'jonas', self::ASK), self::c(2, 'petra', self::APPROVED)]), $raw);
        }
    }

    private function check(array $comments): ApprovalCheck {
        $objects = array_map(function (array $c) {
            $o = $this->createMock(IComment::class);
            $o->method('getId')->willReturn((string)$c['id']);
            $o->method('getVerb')->willReturn('comment');
            $o->method('getActorType')->willReturn($c['actorType']);
            $o->method('getActorId')->willReturn($c['actorId']);
            $o->method('getMessage')->willReturn($c['message']);
            return $o;
        }, $comments);
        $m = $this->createMock(ICommentsManager::class);
        $m->method('getForObject')->with('files', '7', ApprovalCheck::MAX_COMMENTS)->willReturn($objects);
        return new ApprovalCheck($m);
    }

    private function file(string $content): File {
        $f = $this->createMock(File::class);
        $f->method('getId')->willReturn(7);
        $f->method('getSize')->willReturn(strlen($content));
        $f->method('getContent')->willReturn($content);
        return $f;
    }

    public function testAllowsValidCopy(): void {
        $plain = '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"/>';
        $this->assertTrue($this->check([])->allowsValidCopy($this->file($plain)), 'no approval state: as before');
        $this->assertFalse($this->check([])->allowsValidCopy($this->file(self::fixture())), 'claimed, not confirmed');
        $this->assertTrue($this->check([self::c(1, 'jonas', self::ASK), self::c(2, 'petra', self::APPROVED)])->allowsValidCopy($this->file(self::fixture())));
        $this->assertFalse($this->check([])->allowsValidCopy($this->file('not xml')), 'unreadable file');
        // Approval details without a valid version (asked, not approved yet; withdrawn; unreadable): as before.
        $attr = fn (string $json) => '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:s2b="urn:story2bpmn:freigabe" s2b:freigabe="' . htmlspecialchars($json, ENT_QUOTES) . '"/>';
        foreach (['{"status":"zurFreigabe","verantwortlich":{"uid":"petra","name":"P"},"bitte":{"datum":"2026-11-14T10:00:00Z","von":{"uid":"jonas","name":"J"}}}', '{"status":"entwurf"}', '{'] as $json) {
            $this->assertTrue($this->check([])->allowsValidCopy($this->file($attr($json))), $json);
        }
        // For approval with the confirmed valid version unchanged: the plain name, as the client asks.
        $doc = new \DOMDocument();
        $doc->loadXML(self::fixture());
        $root = $doc->documentElement;
        $details = json_decode($root->getAttributeNS('urn:story2bpmn:freigabe', 'freigabe'), true);
        $details['status'] = 'zurFreigabe';
        $root->setAttributeNS('urn:story2bpmn:freigabe', 's2b:freigabe', json_encode($details));
        $review = (string)$doc->saveXML();
        $this->assertSame('zurFreigabe', json_decode((string)ApprovalCheck::readState($review)['approval'], true)['status']);
        $this->assertTrue($this->check([self::c(1, 'jonas', self::ASK), self::c(2, 'petra', self::APPROVED)])->allowsValidCopy($this->file($review)));
        $this->assertFalse($this->check([])->allowsValidCopy($this->file($review)));
    }
}
