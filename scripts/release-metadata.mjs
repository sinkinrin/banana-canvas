import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function extractChangelogSection(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const header = '## [' + version + ']';
  const startIndex = lines.findIndex((line) => line.startsWith(header));
  if (startIndex < 0) {
    throw new Error('CHANGELOG.md 缺少版本 ' + version + '。');
  }

  const endOffset = lines
    .slice(startIndex + 1)
    .findIndex((line) => /^## \[/.test(line));
  const endIndex = endOffset < 0 ? lines.length : startIndex + 1 + endOffset;
  const section = lines.slice(startIndex + 1, endIndex).join('\n').trim();
  if (!section) {
    throw new Error('CHANGELOG.md 中版本 ' + version + ' 的内容为空。');
  }
  return section;
}

export function createClientReleaseNotes(changelog, version) {
  return [
    extractChangelogSection(changelog, version),
    '',
    '> Windows 安装包当前未进行代码签名，安装或更新时可能触发 SmartScreen 提示。',
  ].join('\n').trim();
}

export function embedReleaseNotesInLatestMetadata(latestMetadataPath, changelog, version) {
  const metadata = readFileSync(latestMetadataPath, 'utf8').trimEnd();
  const releaseNotes = createClientReleaseNotes(changelog, version);
  const yamlBlock = releaseNotes
    .split(/\r?\n/)
    .map((line) => `  ${line}`)
    .join('\n');
  const nextMetadata = [
    metadata,
    `releaseName: ${JSON.stringify(`Banana Canvas v${version}`)}`,
    'releaseNotes: |-',
    yamlBlock,
    '',
  ].join('\n');
  writeFileSync(latestMetadataPath, nextMetadata, 'utf8');
}

export function validateVersionMetadata(rootDir, expectedTag) {
  const packageJson = readJson(path.join(rootDir, 'package.json'));
  const packageLock = readJson(path.join(rootDir, 'package-lock.json'));
  const changelog = readFileSync(path.join(rootDir, 'CHANGELOG.md'), 'utf8');
  const readme = readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const readmeCn = readFileSync(path.join(rootDir, 'README_CN.md'), 'utf8');
  const version = packageJson.version;
  const errors = [];

  if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) {
    errors.push('package.json version 不是有效的 SemVer。');
  }
  if (packageLock.version !== version) {
    errors.push('package-lock.json 顶层 version 与 package.json 不一致。');
  }
  if (packageLock.packages?.['']?.version !== version) {
    errors.push('package-lock.json 根包 version 与 package.json 不一致。');
  }
  if (packageLock.name !== packageJson.name || packageLock.packages?.['']?.name !== packageJson.name) {
    errors.push('package-lock.json 包名与 package.json 不一致。');
  }

  const readmeVersion = 'Current version: `' + version + '`';
  if (!readme.includes(readmeVersion)) {
    errors.push('README.md current version was not updated to ' + version + '.');
  }
  const readmeCnVersion = '当前版本：`' + version + '`';
  if (!readmeCn.includes(readmeCnVersion)) {
    errors.push('README_CN.md 当前版本未同步为 ' + version + '。');
  }

  try {
    extractChangelogSection(changelog, version);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (expectedTag && expectedTag !== 'v' + version) {
    errors.push('Git tag ' + expectedTag + ' 与 package.json version ' + version + ' 不一致。');
  }

  if (errors.length > 0) {
    throw new Error('版本元数据校验失败：\n- ' + errors.join('\n- '));
  }

  return { packageJson, packageLock, changelog, version };
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function prepareReleaseArtifacts(rootDir, expectedTag) {
  const { changelog, version } = validateVersionMetadata(rootDir, expectedTag);
  const releaseDir = path.join(rootDir, 'release');
  const installerName = 'banana-canvas-setup-' + version + '.exe';
  const artifactNames = [
    installerName,
    installerName + '.blockmap',
    'latest.yml',
  ];

  for (const name of artifactNames) {
    const artifactPath = path.join(releaseDir, name);
    if (!existsSync(artifactPath) || statSync(artifactPath).size === 0) {
      throw new Error('缺少发布产物：release/' + name);
    }
  }

  const latestMetadata = readFileSync(path.join(releaseDir, 'latest.yml'), 'utf8');
  const latestVersion = latestMetadata.match(/^version:\s*(\S+)\s*$/m)?.[1];
  if (latestVersion !== version) {
    throw new Error('release/latest.yml version 与 package.json 不一致。');
  }
  if (!latestMetadata.includes('url: ' + installerName)) {
    throw new Error('release/latest.yml 未引用预期安装包。');
  }
  if (!/^releaseName:\s+/m.test(latestMetadata) || !/^releaseNotes:\s*\|-/m.test(latestMetadata)) {
    throw new Error('release/latest.yml 缺少客户端可展示的版本名称或更新日志。');
  }

  const releaseNotes = [
    '# Banana Canvas v' + version,
    '',
    createClientReleaseNotes(changelog, version),
    '',
  ].join('\n');
  writeFileSync(path.join(releaseDir, 'release-notes.md'), releaseNotes, 'utf8');

  const checksumLines = [];
  for (const name of artifactNames) {
    const digest = await sha256File(path.join(releaseDir, name));
    checksumLines.push(digest + '  ' + name);
  }
  writeFileSync(
    path.join(releaseDir, 'SHA256SUMS.txt'),
    checksumLines.join('\n') + '\n',
    'utf8'
  );

  return {
    version,
    installerName,
    artifactNames,
  };
}
