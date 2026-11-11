<?php

declare(strict_types=1);

return [
    'routes' => [
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
        ['name' => 'file#show', 'url' => '/api/files/{id}', 'verb' => 'GET', 'requirements' => ['id' => '\d+']],
        ['name' => 'file#update', 'url' => '/api/files/{id}', 'verb' => 'PUT', 'requirements' => ['id' => '\d+']],
        ['name' => 'file#publish', 'url' => '/api/files/{id}/reading-copy', 'verb' => 'PUT', 'requirements' => ['id' => '\d+']],
        ['name' => 'file#create', 'url' => '/api/files', 'verb' => 'POST'],
    ],
];
