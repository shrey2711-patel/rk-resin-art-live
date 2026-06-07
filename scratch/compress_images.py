import os
import sys
import subprocess

try:
    from PIL import Image
except ImportError:
    print("Pillow not found. Installing Pillow image library...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

def compress_folder(folder_path):
    print(f"\nScanning folder: {folder_path}")
    if not os.path.exists(folder_path):
        print("Folder does not exist. Skipping.")
        return 0

    saved_bytes = 0
    for root, dirs, files in os.walk(folder_path):
        for filename in files:
            filepath = os.path.join(root, filename)
            ext = os.path.splitext(filename)[1].lower()
            if ext not in ['.jpg', '.jpeg', '.png']:
                continue

            orig_size = os.path.getsize(filepath)
            # Skip tiny files already under 150KB
            if orig_size < 150 * 1024:
                continue

            print(f"Compressing {filename} ({orig_size / 1024 / 1024:.2f} MB)...")
            try:
                with Image.open(filepath) as img:
                    # Resize if width or height is larger than 1000px
                    max_dimension = 1000
                    w, h = img.size
                    if w > max_dimension or h > max_dimension:
                        if w > h:
                            new_w = max_dimension
                            new_h = int(h * (max_dimension / w))
                        else:
                            new_h = max_dimension
                            new_w = int(w * (max_dimension / h))
                        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

                    # Convert RGBA to RGB for JPEG formatting
                    if img.mode in ('RGBA', 'LA') and ext in ['.jpg', '.jpeg']:
                        img = img.convert('RGB')

                    # Save in-place
                    if ext in ['.jpg', '.jpeg']:
                        img.save(filepath, 'JPEG', quality=80, optimize=True)
                    elif ext == '.png':
                        # Convert to palette mode for huge savings if it's a PNG icon/logo
                        if img.mode in ('RGBA', 'RGB'):
                            img = img.convert('P', palette=Image.Palette.ADAPTIVE, colors=256)
                        img.save(filepath, 'PNG', optimize=True)

                new_size = os.path.getsize(filepath)
                saved = orig_size - new_size
                saved_bytes += saved
                print(f"  -> Reduced to {new_size / 1024:.1f} KB (Saved {saved / 1024 / 1024:.2f} MB)")
            except Exception as e:
                print(f"  ❌ Error compressing {filename}: {e}")

    return saved_bytes

if __name__ == '__main__':
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    
    uploads_dir = os.path.join(base_dir, "data", "uploads")
    public_dir = os.path.join(base_dir, "public")
    
    total_saved = 0
    total_saved += compress_folder(uploads_dir)
    total_saved += compress_folder(public_dir)
    
    print(f"\n🎉 Image compression complete! Total bandwidth size saved: {total_saved / 1024 / 1024:.2f} MB")
