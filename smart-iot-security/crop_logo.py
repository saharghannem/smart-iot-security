from PIL import Image
import numpy as np

def crop_logo():
    # Load the logo image
    img = Image.open('public/logo.png').convert('RGB')
    data = np.array(img)
    
    # Define white background threshold
    # Since it might not be pure white, we check if channels are near 255
    bg_mask = (data[:, :, 0] > 250) & (data[:, :, 1] > 250) & (data[:, :, 2] > 250)
    non_bg_mask = ~bg_mask
    
    # Get coordinates of non-background pixels
    coords = np.argwhere(non_bg_mask)
    if coords.size == 0:
        print("No logo content found!")
        return
        
    y0, x0 = coords.min(axis=0)
    y1, x1 = coords.max(axis=0)
    
    # Add a small padding of 20 pixels around the cropped logo
    padding = 20
    h, w, _ = data.shape
    crop_x0 = max(0, x0 - padding)
    crop_y0 = max(0, y0 - padding)
    crop_x1 = min(w, x1 + padding)
    crop_y1 = min(h, y1 + padding)
    
    # Save the fully cropped logo (without giant white margin)
    cropped_img = img.crop((crop_x0, crop_y0, crop_x1, crop_y1))
    cropped_img.save('public/logo-cropped.png')
    print(f"Saved cropped logo: public/logo-cropped.png (size: {cropped_img.size})")
    
    # Now let's extract just the shield icon (the top portion)
    # The shield is the top part of the logo before the text "SecureGate system AI"
    # We can estimate the text starts in the bottom 30% of the content.
    content_height = y1 - y0
    shield_y1 = y0 + int(content_height * 0.68) # Shield ends around 68% of the height
    
    shield_crop_y1 = min(h, shield_y1 + padding)
    shield_img = img.crop((crop_x0, crop_y0, crop_x1, shield_crop_y1))
    shield_img.save('public/logo-shield.png')
    print(f"Saved shield-only logo: public/logo-shield.png (size: {shield_img.size})")

if __name__ == '__main__':
    crop_logo()
