"""Read-only declared-state decoder for Phase B (coordinator-only). Generalizes the reviewed
read-candidate-snapshot.py: identical archive authentication and little-endian named-run decoding, but the allowed epochs
come from the sealed snapshot plan and the identity pins from a pinned Phase B contract instead of Phase A constants.
Usage: python3 -I phase_b_snapshot_reader.py AUTHENTICATED_ARTIFACT PLAN.json PLAN_SHA256 CONTRACT.json CONTRACT_SHA256 EPOCH previous|next NAME...
CONTRACT.json keys (all required, all supplied by review, never learned from the artifact):
  canonicalRevision, manifestSha256, profileSourceSha256, chromium, prefixFrames (= plan B), snapshotCount (= 2 x planned frames),
  originalReplayFilesVerified, prefixSnapshotChecks (both restored from the reviewed decoder, Vale r5 review)."""
import base64, gzip, hashlib, io, json, math, pathlib, struct, sys
def sha(data): return hashlib.sha256(data).hexdigest()
def pinned_json(path, expected):
    raw = pathlib.Path(path).read_bytes(); assert sha(raw) == expected, 'pin mismatch: ' + str(path); return json.loads(raw)
def check_snapshot_set(snapshots, plan, contract):
    """The harness selects by FRAME and saves both states at every planned frame (Phase A: 9 frames, 18 snapshots).
    So the receipt must hold exactly {previous, next} for every planned candidate frame, each once, and nothing else."""
    frames = sorted({s['epoch'] for s in plan['snapshots'] if s['side'] == 'candidate'})
    expected = {(e, side) for e in frames for side in ('previous', 'next')}
    assert contract['snapshotCount'] == 2 * len(frames) == len(expected)
    for e, side in expected: assert sum(x['epoch'] == e and x['side'] == side for x in snapshots) == 1, (e, side)
    assert {(x['epoch'], x['side']) for x in snapshots} == expected and len(snapshots) == len(expected)
    return expected
def read_phase_b(root, plan, contract, epoch, side, names):
    root = root.resolve(strict=True); sealed = {}
    for line in (root / 'SHA256SUMS').read_text().splitlines():
        digest, name = line.split('  ', 1); p = pathlib.PurePosixPath(name)
        assert not p.is_absolute() and '..' not in p.parts and name not in sealed
        sealed[name] = digest
    def bound(name):
        p = root / name; assert not p.is_symlink() and p.resolve(strict=True).is_relative_to(root)
        data = p.read_bytes(); assert sha(data) == sealed[name], name; return data
    pipeline = json.loads((root / 'pipeline-status.json').read_bytes()); assert pipeline['stage'] == 'complete' and pipeline['exitCode'] == 0
    receipt = json.loads(bound('comparison/receipt.json'))
    assert receipt['status'] == 'complete' and receipt['prefixQualified'] is True and receipt['completedFrames'] == 1251
    assert receipt['prefixFrames'] == contract['prefixFrames'] == plan['B'] and receipt['chromium'] == contract['chromium']
    assert len(receipt['snapshots']) == contract['snapshotCount']
    # Restored from the reviewed decoder: replay-file and prefix-comparison counts are pinned, not trusted.
    assert receipt['originalReplayFilesVerified'] == contract['originalReplayFilesVerified']
    assert receipt['prefixSnapshotChecks'] == contract['prefixSnapshotChecks']
    c = receipt['contract']; assert c['canonicalRevision'] == contract['canonicalRevision'] and c['manifestSha256'] == contract['manifestSha256']
    raw_manifest = bound('candidate-assets/manifest.json'); assert sha(raw_manifest) == contract['manifestSha256']
    layout = json.loads(raw_manifest)['profiles']['424x240']['models']['step']
    check_snapshot_set(receipt['snapshots'], plan, contract)
    # Decode only the exact states the plan asks for; the harness also saves the other state at each planned frame.
    requested = {(s['epoch'], s['state']) for s in plan['snapshots'] if s['side'] == 'candidate'}
    assert (epoch, side) in requested, 'epoch/side not requested by the sealed plan'
    stem = f'comparison/capture/declared-state/epoch-{epoch:04}-{side}'
    meta = json.loads(bound(stem + '.json')); record = next(x for x in receipt['snapshots'] if x['epoch'] == epoch and x['side'] == side)
    assert meta == record and meta['model'] == layout['model'] and meta['stateHash'] == layout['state'][side + '_hash']
    assert meta['byteOrder'] == 'little-endian' and meta['candidateSourceSha256'] == contract['profileSourceSha256']
    prefix = epoch < plan['B'] or (epoch == plan['B'] and side == 'previous'); assert meta['prefixMatched'] is prefix
    expected = []; offset = 0
    for run in layout['state_runs']:
        size = run['count'] * {'f64': 8, 'i64': 8, 'u8': 1}[run['lane']]
        expected.append(dict(name=run['name'], lane=run['lane'], count=run['count'], byteOffset=offset, byteLength=size)); offset += size
    assert meta['runs'] == expected and meta['rawBytes'] == offset and offset <= 32 * 1024 ** 2
    compressed = bound(stem + '.bin.gz'); assert len(compressed) == meta['bytes'] and sha(compressed) == meta['sha256']
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:
        raw = stream.read(offset + 1); assert len(raw) == offset and stream.read(1) == b''
    assert sha(raw) == meta['rawSha256']; runs = {x['name']: x for x in expected}; values = {}
    for name in names:
        run = runs[name]; data = raw[run['byteOffset']:run['byteOffset'] + run['byteLength']]; count, lane = run['count'], run['lane']
        if lane == 'f64':
            floats = struct.unpack('<' + 'd' * count, data)
            values[name] = dict(lane=lane, values=[x if math.isfinite(x) else None for x in floats], ieee754LittleEndian=[data[i:i + 8].hex() for i in range(0, len(data), 8)])
        elif lane == 'i64': values[name] = dict(lane=lane, decimalStrings=[str(x) for x in struct.unpack('<' + 'q' * count, data)])
        else: values[name] = dict(lane=lane, values=list(data))
    return dict(epoch=epoch, side=side, rawSha256=sha(raw), prefixMatched=prefix, canonicalRevision=contract['canonicalRevision'], values=values,
        scope='Phase B candidate declared observation, coordinator-only until labels are sealed. No numerical causality inferred.')
if __name__ == '__main__':
    if len(sys.argv) < 9: raise SystemExit(__doc__)
    plan = pinned_json(sys.argv[2], sys.argv[3]); contract = pinned_json(sys.argv[4], sys.argv[5])
    print(json.dumps(read_phase_b(pathlib.Path(sys.argv[1]), plan, contract, int(sys.argv[6]), sys.argv[7], sys.argv[8:]), indent=2, allow_nan=False))
