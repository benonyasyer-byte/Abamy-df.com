# Abamy DF Store — starter project

Starter frontend multi-klien untuk katalog toko online. Antarmuka dapat dibuka langsung, tetapi autentikasi, database, dan unggah foto **belum aktif** sampai Supabase dikonfigurasi dan SQL diterapkan.

## File
- `index.html` — katalog publik, login/daftar, dashboard klien.
- `style.css` — desain responsif.
- `app.js` — autentikasi, CRUD produk, unggah gambar.
- `config.js` — URL dan publishable key Supabase.
- `supabase-setup.sql` — tabel, RLS, trigger profil toko, dan bucket Storage.

## 1. Siapkan Supabase
1. Buat proyek di https://supabase.com/.
2. Buka SQL Editor pada proyek, lalu jalankan seluruh isi `supabase-setup.sql`.
3. Buka Project Settings → API (atau Connect), salin Project URL dan publishable key/anon public key.
4. Edit `config.js`: isi `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY`.
   - Publishable/anon key memang digunakan oleh frontend dengan RLS yang benar.
   - Jangan pernah memakai `service_role` atau secret key di file browser.
5. Di Authentication → URL Configuration, tambahkan URL website produksi ke Site URL/Redirect URLs.
6. Periksa pengaturan konfirmasi email. Jika diaktifkan, klien harus mengonfirmasi email sebelum login. Uji alur ini setelah deployment.

## 2. Uji lokal
Buka dengan server lokal statis jika memungkinkan (bukan file://), misalnya VS Code Live Server. Koneksi Supabase memerlukan internet.

## 3. Deploy ke Vercel
1. Unggah file project ke repository GitHub.
2. Di https://vercel.com/ pilih Add New → Project dan impor repository.
3. Untuk frontend statis, framework preset dapat dipilih `Other`; tidak perlu build command, output directory dapat dikosongkan/root sesuai instruksi dashboard Vercel.
4. Setelah deploy, masukkan domain Vercel ke Supabase Authentication → URL Configuration.
5. Buka URL produksi, daftar akun uji, konfirmasi email bila diminta, login, tambah produk, lalu cek dari browser privat bahwa produk publik muncul.

## 4. Cara kerja
- Pendaftaran membuat profil toko otomatis lewat trigger database.
- `?shop=slug-toko` membuka etalase toko tertentu.
- Klien hanya dapat mengelola produk yang `store_id`-nya terhubung ke tokonya menurut kebijakan RLS.
- Pengunjung publik hanya membaca produk yang dipublikasikan dan toko aktif.
- WhatsApp checkout saat ini mengarah ke nomor yang diatur di `config.js`; ubah nomor sesuai kebutuhan.

## Batasan penting / hardening sebelum produksi
- Ini adalah starter MVP, bukan sistem e-commerce yang telah diaudit atau diuji produksi.
- Admin invitation, daftar semua klien, dan penonaktifan akun **belum disediakan di UI**. Kelola undangan melalui Supabase Dashboard untuk MVP. Penonaktifan akun secara aman harus dibuat dengan Supabase Edge Function/server-side Admin API yang memverifikasi role admin terkelola server; jangan membuat tombol admin berbasis role dari browser.
- Pemulihan sandi memerlukan konfigurasi email/redirect di Supabase. Alur reset mengirim tautan, tetapi halaman khusus penggantian sandi setelah redirect perlu ditambahkan sebelum produksi.
- Untuk foto: bucket publik membuat foto yang sudah diunggah dapat dilihat publik. Kebijakan upload membatasi folder user dan tipe/ukuran melalui bucket; pertimbangkan scanning gambar dan penghapusan file lama untuk produksi.
- Untuk mengganti foto saat edit, aplikasi menyimpan foto lama jika file baru tidak dipilih. Penghapusan produk menghapus record dan mencoba menghapus file yang tercatat.
- Tambahkan rate limiting, verifikasi email, pemantauan penyalahgunaan, kebijakan admin server-side, dan pengujian keamanan sebelum menerima transaksi nyata.
- Jangan menyimpan nomor kartu, kata sandi, atau data sensitif pembeli di tabel publik.

## Checklist uji keamanan
1. Daftarkan akun A dan B dengan slug berbeda.
2. Login A; buat produk A.
3. Login B; pastikan produk A tidak bisa diedit/dihapus lewat dashboard atau API.
4. Pastikan pengunjung publik hanya melihat produk published dari toko aktif.
5. Coba upload file bukan gambar atau lebih dari 5 MB; harus ditolak.
6. Logout dan pastikan operasi tulis memerlukan autentikasi.
7. Jangan menganggap sistem aman hanya karena tombol disembunyikan; RLS dan Storage policies yang menegakkan akses.
