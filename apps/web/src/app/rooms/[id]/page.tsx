import { RoomView } from "@/components/RoomView";

type RoomPageProps = {
  params: Promise<{ id: string }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { id } = await params;

  return <RoomView roomId={id} />;
}
