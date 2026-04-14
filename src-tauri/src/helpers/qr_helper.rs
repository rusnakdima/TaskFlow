pub fn generate_qr_code_data_url(data: &str) -> String {
  let qr = qrcode::QrCode::new(data.as_bytes()).unwrap();
  let image = qr.render::<image::Luma<u8>>().build();
  let mut png_data: Vec<u8> = Vec::new();
  let mut cursor = std::io::Cursor::new(&mut png_data);
  image::DynamicImage::ImageLuma8(image)
    .write_to(&mut cursor, image::ImageFormat::Png)
    .unwrap();
  format!(
    "data:image/png;base64,{}",
    data_encoding::BASE64.encode(&png_data)
  )
}
