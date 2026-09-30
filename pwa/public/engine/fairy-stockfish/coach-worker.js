let engine = null;
let ready = false;
let initialized = false;
let active = null;
let queued = null;

function send(message) { self.postMessage(message); }
function command(value) { if (engine) engine.postMessage(value); }
function enginePath(file) { return new URL(file, self.location.href).href; }

function parseInfo(line) {
  if (!line.startsWith('info ') || /\b(?:lowerbound|upperbound)\b/.test(line)) return null;
  const depth = /\bdepth (\d+)/.exec(line);
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  const pv = /\bpv (.+)$/.exec(line);
  const multipv = /\bmultipv (\d+)/.exec(line);
  if (!depth || !score || !pv || (multipv && multipv[1] !== '1')) return null;
  const moves = pv[1].trim().split(/\s+/).filter((token) => /^[a-i](?:10|[1-9])[a-i](?:10|[1-9])$/.test(token));
  if (!moves.length) return null;
  return { depth: Number(depth[1]), score: { kind: score[1], value: Number(score[2]) }, pv: moves };
}

function start(job) {
  active = { id: job.id, info: null, cancelled: false };
  const moves = job.moves.length ? ` moves ${job.moves.join(' ')}` : '';
  command(`position startpos${moves}`);
  command(`go movetime ${Math.max(250, Math.min(2200, job.ms || 900))}`);
}

function finish(bestMove) {
  if (!active) return;
  if (active.cancelled) send({ type: 'cancelled', id: active.id });
  else send({ type: 'result', id: active.id, bestMove, info: active.info });
  active = null;
  if (queued) { const next = queued; queued = null; start(next); }
}

function onLine(line) {
  if (line === 'uciok') {
    command('setoption name UCI_Variant value xiangqi');
    command('setoption name Ponder value false');
    command('setoption name UCI_LimitStrength value false');
    command('setoption name Skill Level value 20');
    command('setoption name MultiPV value 1');
    command('isready');
    return;
  }
  if (line === 'readyok') { ready = true; send({ type: 'ready' }); return; }
  if (!active) return;
  const info = parseInfo(line);
  if (info && (!active.info || info.depth >= active.info.depth)) active.info = info;
  const best = /^bestmove\s+(\S+)/.exec(line);
  if (best) finish(best[1]);
}

async function init() {
  if (initialized) return;
  initialized = true;
  if (typeof SharedArrayBuffer === 'undefined') {
    send({ type: 'unavailable', reason: 'This browser session cannot run the threaded Xiangqi engine.' });
    return;
  }
  try {
    importScripts('./stockfish.js');
    if (typeof Stockfish !== 'function') throw new Error('Stockfish factory missing');
    engine = await Stockfish({ locateFile: enginePath, mainScriptUrlOrBlob: enginePath('stockfish.js') });
    engine.addMessageListener(onLine);
    command('uci');
  } catch (error) {
    send({ type: 'unavailable', reason: error instanceof Error ? error.message : String(error) });
  }
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'init') { init(); return; }
  if (data.type === 'cancel') {
    if (queued) send({ type: 'cancelled', id: queued.id });
    queued = null;
    if (active) { active.cancelled = true; command('stop'); }
    return;
  }
  if (data.type !== 'analyze') return;
  if (!ready) { send({ type: 'cancelled', id: data.id }); return; }
  if (active) {
    if (queued) send({ type: 'cancelled', id: queued.id });
    queued = data;
    active.cancelled = true;
    command('stop');
  } else start(data);
});
