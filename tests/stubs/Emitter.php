<?php

declare(strict_types=1);

// Server-internal interface that OCP\Files\IRootFolder extends; not shipped with nextcloud/ocp.
namespace OC\Hooks;

interface Emitter {
    public function listen($scope, $method, callable $callback);

    public function removeListener($scope = null, $method = null, ?callable $callback = null);
}
