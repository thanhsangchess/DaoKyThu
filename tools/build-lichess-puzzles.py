#!/usr/bin/env python3
import csv, io, json, os, random, subprocess, sys

MIN_RATING = 400
MAX_RATING = 1999
BAND = 100
PER_BAND = 220
MIN_POPULARITY = 85
MIN_PLAYS = 300
MAX_DEVIATION = 100
MAX_MOVES = 8

THEMES = {
    'mateIn1', 'mateIn2', 'mateIn3', 'fork', 'pin', 'skewer', 'discoveredAttack',
    'hangingPiece', 'endgame', 'middlegame', 'opening', 'backRankMate', 'smotheredMate',
    'promotion', 'trappedPiece', 'sacrifice', 'deflection', 'attraction', 'defensiveMove',
    'quietMove', 'exposedKing', 'clearance', 'interference', 'doubleCheck', 'capturingDefender',
    'advancedPawn', 'rookEndgame', 'pawnEndgame', 'queenEndgame', 'bishopEndgame', 'knightEndgame',
    'arabianMate', 'anastasiaMate', 'hookMate', 'bodenMate', 'dovetailMate', 'zugzwang', 'attackingF2F7',
}


def open_source(path):
    if path.endswith('.zst'):
        proc = subprocess.Popen(['zstd', '-dc', path], stdout=subprocess.PIPE)
        return io.TextIOWrapper(proc.stdout, encoding='utf-8', newline=''), proc
    return open(path, encoding='utf-8', newline=''), None


def main():
    if len(sys.argv) < 3:
        print('Cách dùng: build-lichess-puzzles.py <lichess_db_puzzle.csv[.zst]> <thư mục xuất>')
        sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    rng = random.Random(20261126)
    bands = {}
    seen = {}
    stream, proc = open_source(src)
    reader = csv.DictReader(stream)
    total = 0
    for row in reader:
        total += 1
        try:
            rating = int(row['Rating'])
            if rating < MIN_RATING or rating > MAX_RATING:
                continue
            if int(row['RatingDeviation']) > MAX_DEVIATION or int(row['Popularity']) < MIN_POPULARITY or int(row['NbPlays']) < MIN_PLAYS:
                continue
            moves = row['Moves'].split()
            if len(moves) < 2 or len(moves) > MAX_MOVES or len(moves) % 2 != 0:
                continue
        except (KeyError, ValueError):
            continue
        b = (rating // BAND) * BAND
        themes = ' '.join(t for t in row['Themes'].split() if t in THEMES)
        item = [row['PuzzleId'], row['FEN'], ' '.join(moves), rating, themes]
        bucket = bands.setdefault(b, [])
        n = seen.get(b, 0) + 1
        seen[b] = n
        if len(bucket) < PER_BAND:
            bucket.append(item)
        else:
            j = rng.randrange(n)
            if j < PER_BAND:
                bucket[j] = item
    if proc:
        proc.wait()
    os.makedirs(out, exist_ok=True)
    manifest = {'source': 'Lichess puzzle database (CC0)', 'band': BAND, 'bands': []}
    count = 0
    for b in sorted(bands):
        items = sorted(bands[b], key=lambda x: (x[3], x[0]))
        name = 'r%04d.json' % b
        with open(os.path.join(out, name), 'w', encoding='utf-8') as f:
            json.dump({'r': b, 'p': items}, f, ensure_ascii=False, separators=(',', ':'))
        manifest['bands'].append({'r': b, 'file': name, 'n': len(items)})
        count += len(items)
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))
    print('Đã đọc %d dòng, giữ %d câu đố trong %d nhóm Elo.' % (total, count, len(manifest['bands'])))


if __name__ == '__main__':
    main()
