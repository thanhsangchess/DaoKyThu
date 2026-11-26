# “Câu đố theo Elo” — hướng dẫn triển khai và kiểm thử

Tài liệu này dành cho giáo viên quản trị Đảo Kỳ Thủ (Firebase project `hoccovua-1f26d`). Tính năng gồm hai lớp:

- **Lớp 1 — Tự luyện ngoài giờ:** học sinh vào “Câu đố theo Elo” ở trang chủ bất cứ lúc nào. Elo gắn với tài khoản Firebase (UID), máy chủ chấm và tính điểm.
- **Lớp 2 — Cả lớp cùng một câu:** giáo viên chọn Elo, chủ đề, câu cụ thể hoặc ngẫu nhiên, cho/không cho gợi ý, giới hạn thời gian. Học sinh trong phòng tự nhận câu, mỗi em giải trên máy mình, giáo viên theo dõi trực tiếp.

## 1. Cách hoạt động (tóm tắt)

| Thành phần | Vai trò |
|---|---|
| `functions/puzzle-bank/` | 3.520 câu đố Lichess (CC0). Chỉ nằm trên máy chủ, **không còn công khai** trên GitHub Pages. |
| `functions/elo-core.js`, `elo-api.js`, `elo-exports.js` | Kiểm tra nước đi bằng chess.js 0.10.3, tính Elo, quản lý phiên lớp. 8 hàm gọi được: `eloPuzzleStart`, `eloPuzzleMove`, `eloPuzzleHint`, `eloPuzzleGiveUp`, `eloSessionBrowse`, `eloSessionCreate`, `eloSessionGet`, `eloSessionEnd`. |
| `eloStats/{uid}` | Elo, số câu, đúng, chuỗi, cao nhất, lịch sử. **Chỉ máy chủ ghi.** |
| `eloAttempts/{id}` | Mỗi lượt làm một câu. Mã lượt = `uid_` + mã ngẫu nhiên do máy học sinh tạo (hoặc `mã phiên_uid` trong lớp). Mỗi lượt chỉ được tính điểm **một lần**. Học sinh không đọc được. |
| `eloSessions/{sid}` và `eloSessions/{sid}/players/{uid}` | Phiên của giáo viên và trạng thái **riêng từng học sinh**. Không có tài liệu nào bị 30 em cùng ghi. |
| `rooms/{phòng}.eloSession` | Con trỏ nhỏ để máy học sinh biết có câu mới. Chỉ máy chủ ghi lúc bắt đầu/kết thúc; giáo viên cập nhật bộ đếm “24/30 em đã xong” tối đa 3 giây một lần. |

Quy tắc điểm: dự kiến thắng = 1 / (1 + 10^((Elo câu − Elo em) / 400)); K = 48 trong 10 câu đầu, sau đó K = 32. Đúng ngay không gợi ý = 1 điểm (Elo luôn tăng ít nhất 1); giải được nhưng có sai hoặc gợi ý = 0,3; bỏ cuộc = 0; **hết giờ hoặc giáo viên kết thúc phiên = Elo không đổi**. Elo nằm trong khoảng 200–2200, bắt đầu từ 600.

Quyền xem: học sinh chỉ thấy Elo và tiến bộ của chính mình. Giáo viên thấy bảng đầy đủ (Elo, số câu, đúng, chính xác %, chuỗi, cao nhất, xu hướng) của học sinh thuộc lớp mình. Không có bảng xếp hạng công khai; trong hoạt động cả lớp học sinh chỉ thấy số lượng “x/y em đã xong”.

## 2. Các tệp thay đổi

- Mới: `functions/elo-core.js`, `functions/elo-api.js`, `functions/elo-exports.js`, `functions/puzzle-bank/*` (17 tệp), `js/elo-class.js`, `docs/cau-do-elo-trien-khai.md`.
- Sửa: `functions/index.js` (thêm 1 dòng nạp `elo-exports`), `functions/package.json` (thêm `chess.js 0.10.3`), `firestore.rules` (thêm 4 khối, phần cũ **giữ nguyên**), `js/elo-puzzles.js` (viết lại theo máy chủ), `css/elo-puzzles.css`, `js/learning-modes.js`, `index.html` (ô “Câu đố theo Elo” ở trang chủ, đổi số phiên bản).
- Xóa: `data/puzzles/` (đã chuyển sang `functions/puzzle-bank/`).

Khối rules mới (đặt ngay trước dòng chặn mặc định `match /{document=**}`):

```
match /eloStats/{uid} {
 allow get: if active() && (request.auth.uid==uid || (teacher() && resource.data.teacherId==request.auth.uid));
 allow list: if teacher() && resource.data.teacherId==request.auth.uid;
 allow write: if false;
}
match /eloAttempts/{id} {allow read,write: if false;}
match /eloSessions/{sid} {
 allow get, list: if teacher() && resource.data.teacherId==request.auth.uid;
 allow write: if false;
 match /players/{pid} {
  allow get, list: if teacher() && resource.data.teacherId==request.auth.uid;
  allow write: if false;
 }
}
```

## 3. Triển khai — làm đúng thứ tự

**Bước 0 — Sao lưu rules đang chạy.** Vào Firebase Console → Firestore Database → Rules, sao chép toàn bộ nội dung đang chạy và đối chiếu với `firestore.rules` trong repo. Nếu trên Console có chỗ nào khác repo (do từng sửa tay), hãy chuyển phần đó vào repo trước khi triển khai, vì lệnh triển khai sẽ **thay toàn bộ** rules bằng nội dung tệp.

**Bước 1 — Triển khai máy chủ** (trên máy có Node 20 trở lên và Firebase CLI):

```
npm install -g firebase-tools
firebase login
cd D:\VuongQuocCoVua_TaiKhoan\VuongQuocCoVua\DaoKyThu
firebase use hoccovua-1f26d
cd functions
npm install
cd ..
firebase deploy --only functions,firestore:rules
```

Lần đầu Firebase có thể yêu cầu bật thêm dịch vụ (Cloud Build, Artifact Registry); hãy đồng ý. Hàm chạy ở vùng `asia-southeast1`, cùng vùng với các hàm gói thành viên hiện có.

**Bước 2 — Đẩy trang web.** Mở GitHub Desktop, commit và Push. Chờ khoảng 10 phút để GitHub Pages cập nhật rồi nhấn Ctrl+F5 trên máy giáo viên và máy học sinh.

Nếu làm ngược thứ tự (đẩy trang trước khi triển khai hàm), học sinh bấm vào sẽ thấy dòng “Máy chủ câu đố chưa được cài đặt…”. Không gây hỏng gì, chỉ cần triển khai hàm là dùng được.

**Quay lại bản cũ nếu cần:** trong `functions` chạy `firebase functions:delete eloPuzzleStart eloPuzzleMove eloPuzzleHint eloPuzzleGiveUp eloSessionBrowse eloSessionCreate eloSessionGet eloSessionEnd --region asia-southeast1`, và dán lại bản rules đã sao lưu ở Bước 0.

## 4. Danh sách kiểm thử với hai tài khoản và nhiều thiết bị

Chuẩn bị: 1 tài khoản giáo viên (máy tính), 2 tài khoản học sinh cùng giáo viên (một máy tính, một điện thoại), 1 tài khoản học sinh của **giáo viên khác** (nếu có).

**A. Tự luyện (Lớp 1)**
1. Học sinh A đăng nhập, ở trang chủ bấm “Luyện câu đố”. Thấy Elo 600 và một câu đố; không cần vào phòng.
2. Đi sai một nước → báo “Chưa đúng”, quân quay lại. Dùng gợi ý → ô sáng xuất hiện.
3. Giải xong → Elo thay đổi. Bấm “Câu tiếp theo”. Đóng và mở lại giữa chừng một câu → vẫn đúng câu cũ, giữ số lỗi và gợi ý.
4. Đăng nhập cùng tài khoản A trên máy thứ hai → Elo giống hệt, đang dở câu nào thì tiếp tục câu đó.
5. Tắt Wi-Fi rồi đi một nước → báo mất mạng; bật lại → tự đồng bộ, không bị cộng điểm hai lần.
6. Trong Firebase Console, mở `eloStats/{uid của A}`: có `elo`, `games`, `solved`, `history`. Thử sửa từ máy học sinh bằng công cụ của trình duyệt (`db.collection('eloStats').doc(uid).update({elo:2200})`) → phải bị từ chối.

**B. Giáo viên xem lớp**
1. Giáo viên mở “Câu đố theo Elo” → nút “Bảng Elo lớp”. Thấy đủ học sinh của mình (kể cả em chưa luyện), sắp xếp theo cột, lọc theo lớp, tải CSV.
2. Học sinh A luyện thêm một câu → bảng cập nhật không cần tải lại trang.
3. Học sinh của giáo viên khác **không** xuất hiện.

**C. Cả lớp cùng một câu (Lớp 2)**
1. Giáo viên tạo phòng lớp; hai học sinh vào phòng.
2. “Cả lớp cùng một câu” → chọn khoảng Elo, một chủ đề, bấm “Xem các câu phù hợp”, chọn một câu, tắt gợi ý, thời gian 2 phút → “Bắt đầu cho cả lớp”.
3. Cả hai máy học sinh **tự** mở đúng câu đó, có đồng hồ, không có nút gợi ý.
4. Em 1 giải đúng; em 2 đi sai một lần. Bảng giáo viên hiện “Đúng ngay” và “Đang làm — Sai 1”. Máy học sinh hiện “x/y em đã xong”, không hiện tên bạn.
5. Bấm “Kết thúc” khi em 2 còn đang làm → máy em 2 báo kết thúc, Elo em 2 không đổi.
6. Giáo viên tải lại trang → mở lại “Cả lớp cùng một câu” thấy phiên đang chạy (nếu còn mở).
7. Học sinh của giáo viên khác, nếu cố mở phiên này, bị từ chối.

**D. Kiểm tra quyền trong Firebase Console → Firestore → Rules → Rules Playground** (nên chạy trước khi dùng thật):

| Người dùng | Thao tác | Kết quả mong đợi |
|---|---|---|
| Học sinh A | `get eloStats/A` | Cho phép |
| Học sinh A | `get eloStats/B` | Từ chối |
| Học sinh A | `update eloStats/A` | Từ chối |
| Học sinh A | `list eloStats` | Từ chối |
| Học sinh A | `get eloAttempts/bất kỳ` | Từ chối |
| Giáo viên | `list eloStats` (lọc `teacherId` = mình) | Cho phép |
| Giáo viên khác | đọc `eloStats` của học sinh không thuộc mình | Từ chối |
| Học sinh A | đọc `eloSessions/{sid}/players/B` | Từ chối |
| Giáo viên | đọc `eloSessions/{sid}/players/*` của phiên mình | Cho phép |
| Bất kỳ ai | ghi `eloSessions` hoặc `players` | Từ chối |

## 5. Những gì đã và chưa được kiểm thử

**Đã kiểm thử (môi trường giả lập):**
- Cả 3.520 câu được kiểm tra bằng chess.js 0.10.3 thật: mọi nước hợp lệ, câu chiếu hết kết thúc đúng bằng chiếu hết; cả 3.520 câu giải đúng được qua mã máy chủ, gồm 61 nước phong cấp.
- Mã máy chủ qua 35 bài kiểm thử tự động (Elo, gửi lại yêu cầu khi mạng chập chờn, tải lại giữa chừng, hết giờ, kết thúc phiên, phân quyền, nhiều học sinh bắt đầu cùng lúc), chạy lặp 25 lần không lỗi.
- Giao diện qua 22 bài kiểm thử trên trình duyệt thật với 1 giáo viên và 4 học sinh (kể cả khổ điện thoại), dùng đúng mã máy chủ trên Firestore giả lập.

**Chưa thể kiểm thử trong phiên làm việc này (cần thầy/cô làm theo mục 3 và 4):**
- Chưa triển khai Cloud Functions lên Firebase thật và chưa chạy trên hai tài khoản thật.
- Chưa chạy Firestore Rules bằng trình giả lập chính thức của Firebase (môi trường không tải được công cụ). Các khối rules mới được viết theo đúng khuôn của các khối đang dùng; hãy chạy bảng ở mục 4D để xác nhận.
- Chưa xác minh trang GitHub Pages trực tiếp sau khi thay đổi.

## 6. Lưu ý và giới hạn đã biết

- Học sinh có thể nhờ máy tính hoặc người khác giải hộ; hệ thống không thể ngăn việc này, chỉ bảo đảm em không tự sửa được Elo hay xem đáp án từ trang web.
- Con trỏ `rooms/{phòng}.eloSession` nằm trong tài liệu phòng mà mọi tài khoản đang hoạt động đều ghi được (quy tắc phòng hiện có). Một em nghịch ngợm có thể làm máy bạn mở một cửa sổ câu đố, nhưng máy chủ chỉ phát câu đố cho phiên thật của đúng giáo viên mình nên không gian lận được.
- Mỗi nước đi là một lần gọi hàm. Một buổi 30 em vài chục câu chỉ vài trăm đến vài nghìn lượt, rất nhỏ so với hạn mức miễn phí; thầy/cô xem bảng giá Firebase hiện hành để chắc chắn.
- Hết giờ được kiểm tra trên máy chủ, có thêm 4 giây dung sai cho độ trễ mạng.
- Lớp 3 (giao bài tập Elo cho cả lớp) chưa làm, theo thỏa thuận.
- Nguồn câu đố: cơ sở dữ liệu Lichess (CC0) đã được ghi ở trang “Nguồn và giấy phép”.

## 7. Khắc phục sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| “Máy chủ câu đố chưa được cài đặt” | Chưa triển khai Functions | Làm Bước 1 |
| “Missing or insufficient permissions” ở bảng Elo | Chưa triển khai rules mới | `firebase deploy --only firestore:rules` |
| Học sinh không tự nhận câu cả lớp | Em chưa vào phòng, hoặc đang dùng bản trang cũ | Kiểm tra em đã vào phòng; Ctrl+F5 |
| “Phiên câu đố đã kết thúc” | Hết giờ hoặc giáo viên đã kết thúc | Giáo viên tạo câu mới |
| Lỗi khi `firebase deploy` về `chess.js` | Chưa chạy `npm install` trong `functions` | Chạy `npm install` rồi triển khai lại |
