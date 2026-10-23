"use client";

import dynamic from "next/dynamic";

const App = dynamic(() => import("./App"), { ssr: false, loading: () => <div className="fatal dim">loading...</div> });

export function Client() {
  return <App />;
}
