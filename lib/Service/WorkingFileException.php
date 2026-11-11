<?php

declare(strict_types=1);

namespace OCA\Story2Bpmn\Service;

/**
 * A refused request on a working file: the HTTP status, an English message (translated by the
 * controller) and extra fields for the client (e.g. the current etag on a conflict).
 */
class WorkingFileException extends \RuntimeException {
    public const NOT_FOUND = 404;
    public const INVALID = 400;
    public const FORBIDDEN = 403;
    public const CONFLICT = 409;
    public const TOO_LARGE = 413;

    /** @param array<string, mixed> $data */
    public function __construct(
        private int $status,
        string $message,
        private array $data = [],
    ) {
        parent::__construct($message);
    }

    public function getStatus(): int {
        return $this->status;
    }

    /** @return array<string, mixed> */
    public function getData(): array {
        return $this->data;
    }
}
