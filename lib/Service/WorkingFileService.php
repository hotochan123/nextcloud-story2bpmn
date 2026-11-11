<?php

declare(strict_types=1);

namespace OCA\Story2Bpmn\Service;

use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotPermittedException;

/**
 * Reads and writes the working files (.bpmn) of one account. Files are found only by id inside the
 * account's own folder, never by a path from the client, so the account's file permissions decide.
 * Saving compares what the client loaded (etag and a SHA-256 of the content) with the file as it is
 * now: no silent overwrite. The etag alone can stay the same after an outside write (file cache,
 * same second), the content hash cannot.
 */
class WorkingFileService {
    public const MAX_BYTES = 2 * 1024 * 1024;
    public const MAX_NAME = 200;
    /** Largest reading copy (PDF) accepted from the client, after base64 decoding. */
    public const MAX_PDF_BYTES = 20 * 1024 * 1024;

    public function __construct(
        private IRootFolder $rootFolder,
    ) {
    }

    /** @return array{id: int, name: string, path: string, etag: string, hash: string, mtime: int, canSave: bool, content: string} */
    public function read(string $uid, int $id): array {
        $file = $this->file($uid, $id);
        if ($file->getSize() > self::MAX_BYTES) {
            throw new WorkingFileException(WorkingFileException::TOO_LARGE, 'The file is too large.');
        }
        $content = $file->getContent();
        if (strlen($content) > self::MAX_BYTES) {
            throw new WorkingFileException(WorkingFileException::TOO_LARGE, 'The file is too large.');
        }
        return $this->describe($uid, $file, $content) + ['content' => $content];
    }

    /** @return array{id: int, name: string, path: string, etag: string, hash: string, mtime: int, canSave: bool} */
    public function write(string $uid, int $id, mixed $content, mixed $etag, bool $force, mixed $hash = null): array {
        $content = $this->content($content);
        $file = $this->file($uid, $id);
        if (!$file->isUpdateable()) {
            throw new WorkingFileException(WorkingFileException::FORBIDDEN, 'You may not change this file. Save it under a new name.');
        }
        if (!$force && !$this->unchanged($file, $etag, $hash)) {
            throw new WorkingFileException(WorkingFileException::CONFLICT, 'The file was changed elsewhere since you opened it.', [
                'etag' => $file->getEtag(),
                'mtime' => $file->getMTime(),
            ]);
        }
        try {
            $file->putContent($content);
        } catch (NotPermittedException) {
            throw new WorkingFileException(WorkingFileException::FORBIDDEN, 'You may not change this file. Save it under a new name.');
        }
        return $this->describe($uid, $this->file($uid, $id), $content);
    }

    /** @return array{id: int, name: string, path: string, etag: string, hash: string, mtime: int, canSave: bool} */
    public function create(string $uid, int $folderId, mixed $name, mixed $content): array {
        $content = $this->content($content);
        $name = self::fileName($name);
        $folder = $this->userFolder($uid)->getFirstNodeById($folderId);
        if (!$folder instanceof Folder || !$folder->isReadable()) {
            throw new WorkingFileException(WorkingFileException::NOT_FOUND, 'The folder was not found.');
        }
        if (!$folder->isCreatable()) {
            throw new WorkingFileException(WorkingFileException::FORBIDDEN, 'You may not create files in this folder.');
        }
        if ($folder->nodeExists($name)) {
            throw new WorkingFileException(WorkingFileException::CONFLICT, 'A file with this name already exists.', ['exists' => true]);
        }
        try {
            $file = $folder->newFile($name, $content);
        } catch (NotPermittedException) {
            throw new WorkingFileException(WorkingFileException::FORBIDDEN, 'You may not create files in this folder.');
        }
        return $this->describe($uid, $this->file($uid, $file->getId()), $content);
    }

    /**
     * Publishes the reading copy: the PDF goes next to the working file, with the
     * working file's name and .pdf instead of .bpmn. An existing PDF of that name is replaced
     * (Nextcloud keeps the old content as a version). Folder and name come from the working file
     * found by id, never from the client.
     *
     * @return array{id: int, name: string, path: string, replaced: bool}
     */
    public function publish(string $uid, int $id, mixed $content): array {
        $pdf = self::pdf($content);
        $file = $this->file($uid, $id);
        $folder = $file->getParent();
        $name = (string)preg_replace('/\.bpmn$/i', '', $file->getName()) . '.pdf';
        $replaced = $folder->nodeExists($name);
        $denied = $replaced
            ? 'You may not change the reading copy. Check the permissions of the folder.'
            : 'You may not create files in this folder.';
        try {
            if ($replaced) {
                $target = $folder->get($name);
                if (!$target instanceof File) {
                    throw new WorkingFileException(WorkingFileException::CONFLICT, 'A folder with the name of the reading copy is in the way.');
                }
                if (!$target->isUpdateable()) {
                    throw new WorkingFileException(WorkingFileException::FORBIDDEN, $denied);
                }
                $target->putContent($pdf);
            } else {
                if (!$folder->isCreatable()) {
                    throw new WorkingFileException(WorkingFileException::FORBIDDEN, $denied);
                }
                $target = $folder->newFile($name, $pdf);
            }
        } catch (NotPermittedException) {
            throw new WorkingFileException(WorkingFileException::FORBIDDEN, $denied);
        }
        return [
            'id' => (int)$target->getId(),
            'name' => $name,
            'path' => (string)$this->userFolder($uid)->getRelativePath($target->getPath()),
            'replaced' => $replaced,
        ];
    }

    /** The PDF bytes of a base64 string from the client; its length is checked before decoding. */
    private static function pdf(mixed $content): string {
        if (!is_string($content) || $content === '') {
            throw new WorkingFileException(WorkingFileException::INVALID, 'The reading copy is not a PDF.');
        }
        if (strlen($content) > intdiv(self::MAX_PDF_BYTES + 2, 3) * 4) {
            throw new WorkingFileException(WorkingFileException::TOO_LARGE, 'The file is too large.');
        }
        $pdf = base64_decode($content, true);
        if ($pdf === false || !str_starts_with($pdf, '%PDF-')) {
            throw new WorkingFileException(WorkingFileException::INVALID, 'The reading copy is not a PDF.');
        }
        if (strlen($pdf) > self::MAX_PDF_BYTES) {
            throw new WorkingFileException(WorkingFileException::TOO_LARGE, 'The file is too large.');
        }
        return $pdf;
    }

    /**
     * A file name from the client: trimmed, no path separators, control characters or leading dot,
     * at most MAX_NAME characters, ending in .bpmn (added when missing).
     */
    public static function fileName(mixed $name): string {
        if (!is_string($name)) {
            throw new WorkingFileException(WorkingFileException::INVALID, 'The file name is not valid.');
        }
        $name = trim($name);
        if (!preg_match('/\.bpmn$/i', $name)) {
            $name .= '.bpmn';
        }
        if ($name === '.bpmn' || str_starts_with($name, '.') || preg_match('#[/\\\\\x00-\x1f\x7f]#', $name)
            || mb_strlen($name) > self::MAX_NAME || !mb_check_encoding($name, 'UTF-8')) {
            throw new WorkingFileException(WorkingFileException::INVALID, 'The file name is not valid.');
        }
        return $name;
    }

    private function content(mixed $content): string {
        if (!is_string($content)) {
            throw new WorkingFileException(WorkingFileException::INVALID, 'The file content is missing.');
        }
        if (strlen($content) > self::MAX_BYTES) {
            throw new WorkingFileException(WorkingFileException::TOO_LARGE, 'The file is too large.');
        }
        return $content;
    }

    /**
     * Is the file still what the client loaded? Both the etag and the hash of the current content
     * must match; a missing etag or hash, or a file now over the size limit, counts as changed.
     */
    private function unchanged(File $file, mixed $etag, mixed $hash): bool {
        if (!is_string($etag) || !is_string($hash) || $etag !== $file->getEtag() || $file->getSize() > self::MAX_BYTES) {
            return false;
        }
        try {
            $current = $file->getContent();
        } catch (\Throwable) {
            return false;
        }
        return hash_equals(self::hash($current), $hash);
    }

    public static function hash(string $content): string {
        return hash('sha256', $content);
    }

    private function userFolder(string $uid): Folder {
        return $this->rootFolder->getUserFolder($uid);
    }

    private function file(string $uid, int $id): File {
        $node = $this->userFolder($uid)->getFirstNodeById($id);
        if ($node === null || !$node->isReadable()) {
            throw new WorkingFileException(WorkingFileException::NOT_FOUND, 'The file was not found.');
        }
        if (!$node instanceof File || !preg_match('/\.bpmn$/i', $node->getName())) {
            throw new WorkingFileException(WorkingFileException::INVALID, 'This is not a working file (.bpmn).');
        }
        return $node;
    }

    /** @return array{id: int, name: string, path: string, etag: string, hash: string, mtime: int, canSave: bool} */
    private function describe(string $uid, Node $file, string $content): array {
        return [
            'id' => (int)$file->getId(),
            'name' => $file->getName(),
            'path' => (string)$this->userFolder($uid)->getRelativePath($file->getPath()),
            'etag' => (string)$file->getEtag(),
            'hash' => self::hash($content),
            'mtime' => (int)$file->getMTime(),
            'canSave' => $file->isUpdateable(),
        ];
    }
}
