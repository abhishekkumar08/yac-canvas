import { useCallback, useEffect, useState } from "react";
import { Home } from "@/ui/Home.jsx";
import { EditorPage } from "@/ui/EditorPage.jsx";
import { JoinRoom } from "@/ui/JoinRoom.jsx";

const readRoute = () => window.location.hash.replace(/^#/, "") || "/";

export function App() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = useCallback((path) => {
    window.location.hash = path;
  }, []);
  const join = route.match(/^\/room\/([\w-]+),([\w-]+)$/);
  if (join) return <JoinRoom roomId={join[1]} roomKey={join[2]} navigate={navigate} />;
  const match = route.match(/^\/board\/([\w-]+)(?:\?room=([\w-]+),([\w-]+))?$/);
  if (match) return <EditorPage boardId={match[1]} room={match[2] ? { roomId: match[2], key: match[3] } : null} navigate={navigate} />;
  return <Home navigate={navigate} />;
}
