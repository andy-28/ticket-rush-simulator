// app/rush/[eventId]/page.tsx
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import RushClient from "./RushClient";

export const dynamic = "force-dynamic";

export default async function RushPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({ where: { id: eventId } });

  if (!event) return notFound();

  return (
    <RushClient
      eventId={event.id}
      eventName={event.name}
      totalTickets={event.totalTickets}
      remaining={event.remaining}
      startAt={event.startAt.toISOString()}
    />
  );
}