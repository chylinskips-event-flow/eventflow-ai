import QRCode from "qrcode";

interface CheckinQrProps {
  checkInToken: string;
  size?: number;
  className?: string;
}

export async function CheckinQr({ checkInToken, size = 240, className }: CheckinQrProps) {
  const dataUrl = await QRCode.toDataURL(checkInToken, {
    width: size,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  return (
    <img
      src={dataUrl}
      alt="Kod QR wejścia"
      width={size}
      height={size}
      className={className}
    />
  );
}
