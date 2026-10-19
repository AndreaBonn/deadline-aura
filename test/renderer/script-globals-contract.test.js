'use strict';

const { existsSync, readdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const RENDERER_DIRECTORY = path.resolve(__dirname, '../../renderer');
const SCRIPT_SOURCE_PATTERN =
  /<script\b[^>]*?\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;
const TOP_LEVEL_DECLARATION_PATTERN =
  /^(?:(?:async\s+)?function\s*\*?\s+|(?:const|let|var|class)\s+)([$A-Z_a-z][$\w]*)/gm;

function extractScriptSources(html) {
  return Array.from(
    html.matchAll(SCRIPT_SOURCE_PATTERN),
    (match) => match[1] ?? match[2] ?? match[3],
  );
}

function extractTopLevelNames(source) {
  return Array.from(source.matchAll(TOP_LEVEL_DECLARATION_PATTERN), (match) => match[1]);
}

function findDuplicateGlobals(scripts) {
  const filesByName = new Map();
  for (const { file, source } of scripts) {
    for (const name of extractTopLevelNames(source)) {
      const files = filesByName.get(name) || new Set();
      files.add(file);
      filesByName.set(name, files);
    }
  }
  return Array.from(filesByName, ([name, files]) => ({ name, files: [...files] })).filter(
    ({ files }) => files.length > 1,
  );
}

describe('script source extraction', () => {
  it('reads quoted and unquoted sources in loading order', () => {
    const html = `<script defer src="first.js"></script>
<script src='second.js'></script><script src=third.js></script>`;
    expect(extractScriptSources(html)).toEqual(['first.js', 'second.js', 'third.js']);
  });

  it('ignores inline scripts and attributes other than src', () => {
    expect(
      extractScriptSources('<script>run();</script><script data-src="fake.js"></script>'),
    ).toEqual([]);
    expect(extractScriptSources('<script src="real.js"></script>')).toEqual(['real.js']);
  });
});

describe('top-level declaration extraction', () => {
  it.each([
    ['function', 'function shared() {}'],
    ['async function', 'async function shared() {}'],
    ['const', 'const shared = 1;'],
    ['let', 'let shared;'],
    ['var', 'var shared;'],
    ['class', 'class shared {}'],
  ])('detects an unindented %s declaration', (_kind, source) => {
    expect(extractTopLevelNames(source)).toEqual(['shared']);
  });

  it('ignores indented declarations and non-declaration lines', () => {
    const source = '  const nested = 1;\n\tfunction nestedFunction() {}\n// const comment = 1;';
    expect(extractTopLevelNames(source)).toEqual([]);
    expect(extractTopLevelNames(`${source}\nlet visible;`)).toEqual(['visible']);
  });

  it('preserves dollar signs and underscores in identifiers', () => {
    expect(extractTopLevelNames('const $shared_1 = 1;\nlet _state;')).toEqual([
      '$shared_1',
      '_state',
    ]);
  });
});

describe('duplicate global detection', () => {
  it.each([
    'function shared() {}',
    'async function shared() {}',
    'const shared = 1;',
    'let shared;',
    'class shared {}',
  ])('reports the name and both files for %s', (source) => {
    const scripts = [
      { file: 'first.js', source },
      { file: 'second.js', source: 'function shared() {}' },
    ];
    expect(findDuplicateGlobals(scripts)).toEqual([
      { name: 'shared', files: ['first.js', 'second.js'] },
    ]);
  });

  it('accepts distinct names and detects a collision when one is added', () => {
    const scripts = [
      { file: 'first.js', source: 'const first = 1;' },
      { file: 'second.js', source: 'let second;' },
    ];
    expect(findDuplicateGlobals(scripts)).toEqual([]);
    expect(
      findDuplicateGlobals([...scripts, { file: 'third.js', source: 'class first {}' }]),
    ).toEqual([{ name: 'first', files: ['first.js', 'third.js'] }]);
  });
});

describe('duplicate global diagnostics', () => {
  it('reports all colliding files once per name', () => {
    const scripts = ['first.js', 'second.js', 'third.js'].map((file) => ({
      file,
      source: 'function shared() {}\nfunction shared() {}',
    }));
    expect(findDuplicateGlobals(scripts)).toEqual([
      { name: 'shared', files: ['first.js', 'second.js', 'third.js'] },
    ]);
  });
});

const rendererPages = readdirSync(RENDERER_DIRECTORY).filter((file) => file.endsWith('.html'));

describe.each(rendererPages)('renderer script contract: %s', (page) => {
  const html = readFileSync(path.join(RENDERER_DIRECTORY, page), 'utf8');
  const scriptSources = extractScriptSources(html);

  it.each(scriptSources)('loads an existing script: %s', (source) => {
    const scriptPath = path.resolve(RENDERER_DIRECTORY, source);
    expect(existsSync(scriptPath), `${page}: missing script ${source} (${scriptPath})`).toBe(true);
  });

  it('has no globals declared by different scripts', () => {
    const scripts = scriptSources.map((file) => ({
      file,
      source: readFileSync(path.resolve(RENDERER_DIRECTORY, file), 'utf8'),
    }));
    const duplicates = findDuplicateGlobals(scripts);
    expect(duplicates, `${page}: duplicate globals ${JSON.stringify(duplicates)}`).toEqual([]);
  });
});
