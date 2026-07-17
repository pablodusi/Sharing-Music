import { CreateRoomForm } from "@/components/CreateRoomForm";

export default function CreateRoomPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent">
          New session
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">Create a room</h1>
        <p className="mt-2 text-sm text-muted">
          Rooms live on the API. Your guest identity stays in this browser so you keep
          the same membership after refresh.
        </p>
      </div>

      <CreateRoomForm />
    </div>
  );
}
