export default function Home() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-[#071321]">
      <iframe
        src="/game.html"
        title="Life Quest — jogo multiplayer"
        className="h-full w-full border-0"
        allow="fullscreen"
      />
    </main>
  );
}
