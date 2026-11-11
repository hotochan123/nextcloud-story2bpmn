<?php

declare(strict_types=1);

namespace OCA\Story2Bpmn\Controller;

use OCA\Story2Bpmn\AppInfo\Application;
use OCA\Story2Bpmn\Service\WorkingFileException;
use OCA\Story2Bpmn\Service\WorkingFileService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUserSession;

/** JSON API of the working files: open, save (with etag check) and save as. */
class FileController extends Controller {
    public function __construct(
        IRequest $request,
        private WorkingFileService $files,
        private IUserSession $userSession,
        private IL10N $l,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function show(int $id): JSONResponse {
        return $this->run(fn (string $uid) => $this->files->read($uid, $id));
    }

    #[NoAdminRequired]
    public function update(int $id, mixed $content = null, mixed $etag = null, mixed $force = false, mixed $hash = null): JSONResponse {
        return $this->run(fn (string $uid) => $this->files->write($uid, $id, $content, $etag, $force === true || $force === 'true', $hash));
    }

    #[NoAdminRequired]
    public function create(int $folderId = 0, mixed $name = null, mixed $content = null): JSONResponse {
        return $this->run(fn (string $uid) => $this->files->create($uid, $folderId, $name, $content), Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function publish(int $id, mixed $content = null): JSONResponse {
        return $this->run(fn (string $uid) => $this->files->publish($uid, $id, $content));
    }

    /** @param callable(string): array<string, mixed> $action */
    private function run(callable $action, int $status = Http::STATUS_OK): JSONResponse {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return new JSONResponse(['message' => $this->l->t('Please log in.')], Http::STATUS_UNAUTHORIZED);
        }
        try {
            return new JSONResponse($action($user->getUID()), $status);
        } catch (WorkingFileException $e) {
            return new JSONResponse(['message' => $this->message($e->getMessage())] + $e->getData(), $e->getStatus());
        }
    }

    /** Literal calls so the translation scan finds every message. */
    private function message(string $english): string {
        return match ($english) {
            'The file was not found.' => $this->l->t('The file was not found.'),
            'The folder was not found.' => $this->l->t('The folder was not found.'),
            'This is not a working file (.bpmn).' => $this->l->t('This is not a working file (.bpmn).'),
            'The file is too large.' => $this->l->t('The file is too large.'),
            'The file content is missing.' => $this->l->t('The file content is missing.'),
            'The file name is not valid.' => $this->l->t('The file name is not valid.'),
            'A file with this name already exists.' => $this->l->t('A file with this name already exists.'),
            'The file was changed elsewhere since you opened it.' => $this->l->t('The file was changed elsewhere since you opened it.'),
            'You may not change this file. Save it under a new name.' => $this->l->t('You may not change this file. Save it under a new name.'),
            'You may not create files in this folder.' => $this->l->t('You may not create files in this folder.'),
            'The reading copy is not a PDF.' => $this->l->t('The reading copy is not a PDF.'),
            'A folder with the name of the reading copy is in the way.' => $this->l->t('A folder with the name of the reading copy is in the way.'),
            'You may not change the reading copy. Check the permissions of the folder.' => $this->l->t('You may not change the reading copy. Check the permissions of the folder.'),
            default => $this->l->t('The request could not be carried out.'),
        };
    }
}
