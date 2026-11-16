<?php

declare(strict_types=1);

namespace OCA\Story2Bpmn\Service;

use OCP\Comments\IComment;
use OCP\Comments\ICommentsManager;
use OCP\Files\File;

/**
 * Does Nextcloud confirm the valid version a working file claims (docs/adr/0006-approval-through-nextcloud.md)?
 * Anyone who may edit the file can write its attribute `s2b:freigabe`; a comment carries the account
 * that wrote it. The valid version counts only with an approval comment of its approver that names its
 * number and the check code of exactly the story in the file, written after another account asked the
 * approver for approval in a comment. The same rule as confirmApproval() in src/approval.ts; the check
 * code is approvalCode() of src/core/fingerprint.ts.
 */
class ApprovalCheck {
    private const STORY_NS = 'urn:bpmn-core:geschichte';
    private const APPROVAL_NS = 'urn:story2bpmn:freigabe';
    private const XML_NS = 'http://www.w3.org/XML/1998/namespace';
    /** The newest comments read, as in src/nextcloudApi.js. */
    public const MAX_COMMENTS = 1000;
    private const MAX_COMMENT = 2000;

    public function __construct(
        private ICommentsManager $comments,
    ) {
    }

    /**
     * May the reading copy of this working file go under the name of the valid version? Yes when the
     * file claims no valid version (no approval details, or ones without a `gueltig` object, e.g. a
     * request before the first approval; its reading copy carries the DRAFT mark), else only when
     * Nextcloud confirms the claimed one.
     */
    public function allowsValidCopy(File $file): bool {
        try {
            if ($file->getSize() > WorkingFileService::MAX_BYTES) {
                return false;
            }
            $xml = $file->getContent();
        } catch (\Throwable) {
            return false;
        }
        if (strlen($xml) > WorkingFileService::MAX_BYTES) {
            return false;
        }
        $state = self::readState($xml);
        if ($state === null) {
            return false;
        }
        if (!self::claimsValid($state['approval'])) {
            return true;
        }
        return self::confirms($state, $this->commentsOf((string)$file->getId()));
    }

    /**
     * The parts of a working file the check needs: the stored story text, the diagram language and the
     * raw approval attribute (null when the file has none). Null when the file cannot be read.
     *
     * @return array{story: string, language: string, approval: ?string}|null
     */
    public static function readState(string $xml): ?array {
        if ($xml === '' || preg_match('/<!DOCTYPE/i', $xml)) {
            return null;
        }
        $doc = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        try {
            $ok = $doc->loadXML($xml, LIBXML_NONET | LIBXML_NOCDATA);
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }
        $root = $ok ? $doc->documentElement : null;
        if ($root === null) {
            return null;
        }
        return [
            'story' => $root->getAttributeNS(self::STORY_NS, 'geschichte'),
            'language' => $root->getAttributeNS(self::XML_NS, 'lang'),
            'approval' => $root->hasAttributeNS(self::APPROVAL_NS, 'freigabe') ? $root->getAttributeNS(self::APPROVAL_NS, 'freigabe') : null,
        ];
    }

    /** Does the approval attribute claim a valid version? Unreadable details claim nothing (the client ignores them too). */
    public static function claimsValid(?string $approval): bool {
        if ($approval === null) {
            return false;
        }
        $a = json_decode($approval, true, 64);
        return is_array($a) && is_array($a['gueltig'] ?? null);
    }

    /** Check code of valid version `$number`: 16 hex digits of SHA-256 over number, language and story text. */
    public static function code(int $number, string $language, string $story): string {
        return substr(hash('sha256', $number . "\n" . $language . "\n" . $story), 0, 16);
    }

    /** Number and check code of an approval comment, null for any other comment. */
    public static function parseApproved(string $message): ?array {
        if (strlen($message) > self::MAX_COMMENT * 4) {
            return null;
        }
        $m = [];
        $text = trim(str_replace("\r\n", "\n", $message));
        if (!preg_match('/^(?:@"[^"\n]*" )?(?:Als Gültige Version (\d{1,7}) freigegeben\.|Approved as valid version (\d{1,7})\.)\n(?:Prüfkennung|Check code): ([0-9a-f]{16})$/u', $text, $m)) {
            return null;
        }
        return ['number' => (int)($m[1] !== '' ? $m[1] : $m[2]), 'code' => $m[3]];
    }

    /** The account a request comment asks for approval, null for any other comment. */
    public static function requestedOf(string $message): ?string {
        $m = [];
        return strlen($message) <= self::MAX_COMMENT * 4 && preg_match('/^@"([^"\n]+)" (?:Bitte um Freigabe von „|Please approve ")/u', $message, $m) ? $m[1] : null;
    }

    /**
     * @param array{story: string, language: string, approval: ?string} $state
     * @param list<array{id: int, actorType: string, actorId: string, message: string}> $comments
     */
    public static function confirms(array $state, array $comments): bool {
        $a = json_decode((string)$state['approval'], true, 64);
        if (!is_array($a) || !is_array($a['gueltig'] ?? null)) {
            return false;
        }
        $number = $a['gueltig']['nummer'] ?? null;
        $by = $a['gueltig']['von']['uid'] ?? null;
        if (!is_int($number) || $number < 1 || !is_string($by) || $by === '' || $state['story'] === '' || $state['language'] === '') {
            return false;
        }
        $code = self::code($number, $state['language'], $state['story']);
        $users = array_values(array_filter($comments, fn (array $c) => $c['actorType'] === 'users' && $c['actorId'] !== ''));
        foreach ($users as $c) {
            if ($c['actorId'] !== $by) {
                continue;
            }
            $p = self::parseApproved($c['message']);
            if ($p === null || $p['number'] !== $number || !hash_equals($code, $p['code'])) {
                continue;
            }
            foreach ($users as $r) {
                if ($r['actorId'] !== $by && $r['id'] < $c['id'] && self::requestedOf($r['message']) === $by) {
                    return true;
                }
            }
        }
        return false;
    }

    /** @return list<array{id: int, actorType: string, actorId: string, message: string}> */
    private function commentsOf(string $fileId): array {
        $out = [];
        $list = $this->comments->getForObject('files', $fileId, self::MAX_COMMENTS);
        foreach (is_array($list) ? $list : [] as $c) {
            if (!$c instanceof IComment || $c->getVerb() !== 'comment') {
                continue;
            }
            $out[] = ['id' => (int)$c->getId(), 'actorType' => (string)$c->getActorType(), 'actorId' => (string)$c->getActorId(), 'message' => (string)$c->getMessage()];
        }
        return $out;
    }
}
