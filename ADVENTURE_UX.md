# Khám phá Đảo Kỳ Thủ — điều hướng và phần thưởng (25/10/2026)

## Điều hướng nhanh

- Thanh **Hành trình của em** mở trực tiếp 5 vùng hiện có, có tiến độ từng vùng và nút trở về bản đồ.
- Vùng 1: hai menu Khám phá bàn cờ / Quân cờ và luật chơi.
- Vùng 2: đổi giữa 6 quân Xe, Tượng, Hậu, Vua, Mã, Tốt ngay khi đang luyện.
- Vùng 3: Ăn quân / Ăn quân không được bảo vệ.
- Vùng 4: Phòng thủ / Phòng thủ quân bị tấn công.
- Vùng 5: Thoát chiếu / Thoát chiếu nâng cao.
- Trong cửa sổ bài tập Vùng 3–5 có chọn dạng bài, chọn bài, Bài tiếp, Danh sách bài, Đổi vùng. Các nút gọi hàm bài tập gốc để giữ nguyên luật.
- Khi hoàn thành bài lần đầu có xác nhận phần thưởng, nút tiếp tục và chuyển vùng.

## Phần thưởng công khai, cố định, không quay ngẫu nhiên

| Vùng | Số bài | Sao tối đa | Xu khi hoàn thành vùng (một lần) | Huy hiệu |
|---|---:|---:|---:|---|
| Bến Cảng (1) | 10 | 30 | 1.000 | Đầu xuôi đuôi lọt |
| Rừng Sao (2) | 6 | 36 | 2.000 | Bậc thầy nhặt sao |
| Hẻm Núi (3) | 13 | 39 | 3.000 | Bậc thầy ăn quân |
| Hang Pha Lê (4) | 14 | 42 | 4.000 | Bậc thầy phòng thủ |
| Núi Lửa (5) | 13 | 39 | 5.000 | Trung quân ái quốc |

- Vùng 1,3,4,5: 3 sao/bài lần đầu; Vùng 2: 6 sao/bài lần đầu.
- Cột mốc tiến bộ 25%, 50%, 75%, 100%: Khởi đầu, Tiến bộ, Vững vàng, Chinh phục. Là danh hiệu minh họa theo tiến độ, **không phát sinh xu**.
- Xu và huy hiệu hoàn thành vùng tự cập nhật, không cần nhấn nhận; làm lại không tăng số dư.
- Vùng 6 và 7 vẫn sắp ra mắt, không tính vào 5 vùng thưởng đang hoạt động.
- Giữ nguyên tiến độ Firestore, schema, giá nhân vật và chế độ lớp học.

## Kiểm thử cần thực hiện sau khi GitHub Pages triển khai

1. Trên điện thoại và máy tính, mở Khám phá các đảo, chuyển từ Vùng 3 sang Vùng 5 ngay trong bài tập.
2. Trong Vùng 3 thử chuyển Ăn quân sang Ăn quân không được bảo vệ bằng menu của cửa sổ bài.
3. Hoàn thành một bài lần đầu rồi chơi lại: số sao không tăng lần hai.
4. Vùng 2: khi nhặt đủ 6 sao, bấm Bài tiếp hoặc Đổi vùng ngay trong cửa sổ phần thưởng.
5. Hoàn thành Vùng 3: đúng 39 sao, thêm 3.000 xu một lần, huy hiệu và rương.
6. Đăng xuất, đăng nhập, kiểm tra tiến độ và vật phẩm đã mua vẫn được giữ.
7. Trong **Vào lớp**, thực hiện bài tập đồng bộ giáo viên–học sinh như trước để bảo đảm không bị ảnh hưởng.

Kiểm thử logic bằng DOM giả lập đã kiểm tra chuyển vùng/nhóm bài, và Vùng 3 đủ 13 bài chỉ được cộng 3.000 xu đúng một lần. Chưa có xác nhận UI trên điện thoại thật hoặc Firestore production.
