import { headers } from "next/headers";
import { ClaimPage } from "@/components/claim/ClaimPage";

type Props = { params: Promise<{ id: string }> };

export default async function GiftClaimRoute({ params }: Props) {
  const [{ id }, headerList] = await Promise.all([params, headers()]);
  const nonce = headerList.get("x-nonce") ?? undefined;
  return <ClaimPage giftId={id} nonce={nonce} />;
}
