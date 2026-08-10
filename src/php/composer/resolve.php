<?php

declare(strict_types=1);

use Composer\Semver\Semver;
use Composer\Semver\VersionParser;

$input = json_decode(file_get_contents('/app/.liminal/tmp/in.json'), true, 512, JSON_THROW_ON_ERROR);
$constraints = $input['constraints'] ?? [$input['constraint'] ?? '*'];
$stability = $input['stability'] ?? 'stable';
$matches = [];

foreach ($input['candidates'] ?? [] as $candidate) {
    $version = $candidate['version'] ?? '';
    if ($version === '') {
        continue;
    }
    if ($stability === 'stable' && VersionParser::parseStability($version) !== 'stable') {
        continue;
    }

    foreach ($constraints as $constraint) {
        if (!Semver::satisfies($version, $constraint ?: '*')) {
            continue 2;
        }
    }
    $matches[$version] = $candidate;
}

$versions = Semver::rsort(array_keys($matches));
$chosen = $versions === [] ? null : $matches[$versions[0]];
$normalized = null;

if ($chosen !== null) {
    try {
        $normalized = (new VersionParser())->normalize($chosen['version']);
    } catch (UnexpectedValueException) {
        $normalized = $chosen['version_normalized'] ?? $chosen['version'];
    }
}

echo json_encode([
    'chosen' => $chosen,
    'normalized' => $normalized,
], JSON_THROW_ON_ERROR);
