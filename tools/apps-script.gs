/**
 * 꽌시 노트 ↔ 구글시트 동기화용 Apps Script
 *
 * 시트의 'sync' 탭 A열에 암호화된 데이터만 저장한다 (비밀번호 없이는 읽을 수 없음).
 *   A1      : rev (저장할 때마다 1씩 증가)
 *   A2 이후 : 암호문을 40,000자씩 나눈 조각 (셀 한 칸 최대 50,000자 제한 때문)
 *
 * 쓰기 권한: 처음 저장한 기기가 보낸 토큰(비밀번호에서 만든 값)을 기억하고,
 * 이후에는 같은 토큰(또는 비밀번호 변경 시 이전 토큰)을 보낸 요청만 저장한다.
 */
const CHUNK = 40000;

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName('sync') || ss.insertSheet('sync');
}

function read_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return { rev: Number(sh.getRange('A1').getValue()) || 0, blob: null };
  const v = sh.getRange(1, 1, last, 1).getValues().map(r => String(r[0]));
  // 각 조각 앞의 '|'는 '='·'+'로 시작하는 조각이 수식으로 해석되지 않게 붙인 것
  const json = v.slice(1).map(x => x.slice(1)).join('');
  return { rev: Number(v[0]) || 0, blob: json ? JSON.parse(json) : null };
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const d = read_();
  return out_(e && e.parameter && e.parameter.rev ? { rev: d.rev } : d);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const req = JSON.parse(e.postData.contents);
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('token');
    if (!req.token) return out_({ ok: false, error: 'token' });
    if (token && req.token !== token && req.prevToken !== token) return out_({ ok: false, error: 'token' });

    const cur = read_();
    if (req.baseRev !== cur.rev && !req.force) return out_({ ok: false, error: 'conflict', rev: cur.rev });

    const s = JSON.stringify(req.blob);
    const rows = [[cur.rev + 1]];
    for (let i = 0; i < s.length; i += CHUNK) rows.push(['|' + s.slice(i, i + CHUNK)]);
    const sh = sheet_();
    sh.clearContents();
    sh.getRange(1, 1, rows.length, 1).setNumberFormat('@').setValues(rows);
    props.setProperty('token', req.token);
    return out_({ ok: true, rev: cur.rev + 1 });
  } finally {
    lock.releaseLock();
  }
}
