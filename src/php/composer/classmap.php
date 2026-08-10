<?php

declare(strict_types=1);

/**
 * Build the classmap entries Composer would create for a file or directory.
 *
 * @return array<string, string>
 */
function liminal_scan_classmap(string $path): array
{
    $files = [];

    if (is_file($path) && str_ends_with(strtolower($path), '.php')) {
        $files[] = $path;
    } elseif (is_dir($path)) {
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS)
        );

        foreach ($iterator as $file) {
            if ($file->isFile() && strtolower($file->getExtension()) === 'php') {
                $files[] = $file->getPathname();
            }
        }
    }

    $classmap = [];
    foreach ($files as $file) {
        $source = file_get_contents($file);
        if ($source === false) {
            continue;
        }

        $tokens = token_get_all($source);
        $namespace = '';
        $previousSignificant = null;
        $count = count($tokens);

        for ($i = 0; $i < $count; $i++) {
            $token = $tokens[$i];
            if (!is_array($token)) {
                if (trim($token) !== '') {
                    $previousSignificant = $token;
                }
                continue;
            }

            [$id] = $token;
            if ($id === T_NAMESPACE) {
                $namespace = '';
                for ($j = $i + 1; $j < $count; $j++) {
                    $next = $tokens[$j];
                    if ($next === ';' || $next === '{') {
                        $i = $j;
                        break;
                    }
                    if (is_array($next) && in_array($next[0], [T_STRING, T_NAME_QUALIFIED, T_NS_SEPARATOR], true)) {
                        $namespace .= $next[1];
                    }
                }
                $previousSignificant = T_NAMESPACE;
                continue;
            }

            $classTokens = [T_CLASS, T_INTERFACE, T_TRAIT];
            if (defined('T_ENUM')) {
                $classTokens[] = T_ENUM;
            }

            if (
                in_array($id, $classTokens, true)
                && !in_array($previousSignificant, [T_NEW, T_DOUBLE_COLON], true)
            ) {
                for ($j = $i + 1; $j < $count; $j++) {
                    $next = $tokens[$j];
                    if (is_array($next) && $next[0] === T_STRING) {
                        $name = $namespace === '' ? $next[1] : $namespace.'\\'.$next[1];
                        $classmap[$name] = $file;
                        $i = $j;
                        break;
                    }
                    if (!is_array($next) && $next === '{') {
                        break;
                    }
                }
            }

            if (!in_array($id, [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
                $previousSignificant = $id;
            }
        }
    }

    return $classmap;
}
