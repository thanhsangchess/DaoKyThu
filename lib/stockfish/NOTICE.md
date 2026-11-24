# Stockfish – thông báo giấy phép / License notice

Chế độ **Đấu với máy** và **Cờ tàn Chernev** của Đảo Kỳ Thủ dùng động cơ cờ vua **Stockfish**.

| | |
|---|---|
| Động cơ | Stockfish 19 (bản dựng WebAssembly, *lite*, đơn luồng) |
| Bản đóng gói | [stockfish.js 19.0.1](https://github.com/nmrugg/stockfish.js) (npm: `stockfish@19.0.1`), tệp `stockfish-19-lite-single.js` + `stockfish-19-lite-single.wasm` |
| Mã nguồn gốc | https://github.com/official-stockfish/Stockfish |
| Giấy phép | **GNU General Public License v3.0** – https://www.gnu.org/licenses/gpl-3.0.html |
| Bản quyền | © The Stockfish developers (xem tệp AUTHORS trong mã nguồn Stockfish) |

## Cách trang web dùng Stockfish

- Stockfish chạy **trong Web Worker của trình duyệt người dùng**; trang giao tiếp với nó bằng giao thức UCI (`position fen …`, `go movetime …`, `bestmove …`).
- Trang **không sửa đổi** mã Stockfish. Tệp `.js` và `.wasm` được tải nguyên bản (từ thư mục này nếu có, nếu không thì từ jsDelivr / unpkg, đúng phiên bản 19.0.1).
- Mã của Đảo Kỳ Thủ (`js/vs-machine-engine.js`, `js/vs-machine.js`) chỉ là phần cầu nối/giao diện, **không** nhúng mã Stockfish.
- Người dùng được quyền nhận mã nguồn Stockfish theo GPLv3: xem các liên kết ở bảng trên (mã nguồn tương ứng với bản 19 có trong kho `official-stockfish/Stockfish`, bản đóng gói WebAssembly có trong kho `nmrugg/stockfish.js`).
- Nếu bạn tự lưu hai tệp động cơ trong kho này, hãy giữ nguyên tệp này cùng với bản sao giấy phép GPLv3 (`LICENSE`/`COPYING`) đặt cạnh chúng.

## Lưu trữ cục bộ (tùy chọn, để chạy không cần Internet/CDN)

1. Tải gói `stockfish@19.0.1` từ npm (`npm pack stockfish@19.0.1`).
2. Chép hai tệp `bin/stockfish-19-lite-single.js` và `bin/stockfish-19-lite-single.wasm` vào thư mục `lib/stockfish/` của kho (cùng tên, không đổi).
3. Chép kèm tệp giấy phép GPLv3 của gói vào cùng thư mục.

Trang sẽ ưu tiên dùng bản trong `./lib/stockfish/`, sau đó mới thử CDN. Dung lượng khoảng 1,9 MB (đơn luồng, không cần COOP/COEP nên chạy được trên GitHub Pages).

---

This site's *Play vs Machine* and *Chernev Endgames* modes use **Stockfish** (GPL-3.0-or-later), run unmodified inside the user's browser as a WebAssembly Web Worker (stockfish.js 19.0.1, lite single-threaded build). Source code: https://github.com/official-stockfish/Stockfish and https://github.com/nmrugg/stockfish.js. License text: https://www.gnu.org/licenses/gpl-3.0.html. The site's own bridge/UI code does not embed Stockfish code; it only talks to it through the UCI protocol.
