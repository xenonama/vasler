

```markdown
# 🚀 وصلر (vasler)- جمع‌آوری‌کننده حرفه‌ای پروکسی و کانفیگ

**وصللر** یک اپلیکیشن دسکتاپ قدرتمند و چندسکویی است که با **Electron** و **TypeScript** ساخته شده و برای جمع‌آوری، اعتبارسنجی و خروجی‌گیری پروکسی‌ها و کانفیگ‌های V2Ray از مخزن‌های مختلف گیت‌هاب طراحی شده است.

---

## ✨ قابلیت‌ها

- 📥 **جمع‌آوری پروکسی** – HTTP, HTTPS, SOCKS4, SOCKS5, MTProto  
- 🛸 **جمع‌آوری کانفیگ V2Ray** – VMess, VLess, Trojan, Shadowsocks  
- 📂 **مدیریت مخزن‌ها** – افزودن، حذف، فعال/غیرفعال‌سازی مخزن‌ها  
- 🔄 **همگام‌سازی از گیت‌هاب** – دریافت خودکار لیست مخزن‌های جدید  
- ✅ **بررسی زنده بودن** – تست در دسترس بودن پروکسی با اتصال TCP  
- 🚀 **تست سرعت** – تست ۱۰۰ پروکسی برتر و نمایش ۱۰ تا سریع‌ترین  
- 📡 **پینگ کانفیگ** – تست کانفیگ‌های V2Ray با استفاده از Xray-core  
- 📋 **نمایش نتایج** – مشاهده پروکسی‌ها و کانفیگ‌های جمع‌آوری شده با دکمه "بیشتر"  
- 🎨 **تم‌های تاریک و روشن** – تغییر بین حالت تاریک و روشن  
- 🖥️ **سینی سیستم** – دسترسی سریع از سینی سیستم  
- 📤 **خروجی‌گیری** – خروجی در فرمت‌های TXT، CSV و JSON  
- ⬆️ **به‌روزرسانی خودکار** – بررسی خودکار نسخه‌های جدید  

---

## 📸 تصاویر

| جمع‌آوری‌کننده | نتایج | پینگر |
|-----------|---------|--------|
| ![Collector](https://raw.githubusercontent.com/xenonama/vasler/main/assets/screenshot-collector.jpg) | ![Results](https://raw.githubusercontent.com/xenonama/vasler/main/assets/screenshot-results.jpg) | ![Pinger](https://raw.githubusercontent.com/xenonama/vasler/main/assets/screenshot-pinger.jpg) |

| مخزن‌ها | تنظیمات |
|--------------|----------|
| ![Repositories](https://raw.githubusercontent.com/xenonama/vasler/main/assets/screenshot-repositories.jpg) | ![Settings](https://raw.githubusercontent.com/xenonama/vasler/main/assets/screenshot-settings.jpg) |

---

## 🚀 نصب

### **از روی سورس**

```bash
# کلون کردن مخزن
git clone https://github.com/xenonama/vasler.git
cd vasler

# نصب وابستگی‌ها
npm install

# ساخت پروژه
npm run build

# اجرای برنامه
npm start
