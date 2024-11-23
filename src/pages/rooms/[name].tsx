import { PreJoin, LocalUserChoices } from "@livekit/components-react";
import type { NextPage } from "next";
import { useRouter } from "next/router";
import { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { AiFillSetting, AiOutlineCopy } from "react-icons/ai";
import ActiveRoom from "@/components/activeRoom";
import Head from "next/head";
import FullScreenLoader from "@/components/fullScreenLoader";

const RoomPage: NextPage = () => {
  const router = useRouter();
  const { name } = router.query;
  const { data: session, status } = useSession();
  const [preJoinChoices, setPreJoinChoices] = useState<LocalUserChoices>({
    username: session?.user?.name || "",
    videoEnabled: true,
    audioEnabled: true,
  });

  const [selectedCode, setSelectedCode] = useState("en-US");
  
  // Show loading while checking session
  if (status === "loading") return <FullScreenLoader />;
  
  // Redirect to sign in if no session
  if (!session) {
    signIn("google");
    return null;
  }

  // Show loading if we don't have the room name yet
  if (!router.isReady || !name || Array.isArray(name)) {
    return <FullScreenLoader />;
  }

  const languageCodes = [
    { language: "English", code: "en-US" },
    { language: "Hindi", code: "hi" },
    { language: "Japanese", code: "ja" },
    { language: "French", code: "fr" },
    { language: "Deutsch", code: "de" },
  ];

  return (
    <>
      <Head>
        <title>AudioWiz - Room {name}</title>
        <meta name="description" content="AudioWiz Video Room" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main data-lk-theme="default">
        {name && !Array.isArray(name) ? (
          <>
            <ActiveRoom
              roomName={name}
              userChoices={preJoinChoices}
              onLeave={() => router.push('/')}
              userId={session?.user.id as string}
              selectedLanguage={selectedCode}
            />
            <div className="lk-prejoin" style={{ width: "100%" }}>
              <label className="flex items-center justify-center gap-2">
                <span className="flex items-center space-x-2 text-center text-xs lg:text-sm">
                  <AiFillSetting />
                  <a>Switch Language</a>
                </span>
                <select
                  className="lk-button"
                  onChange={(e) => setSelectedCode(e.target.value)}
                  defaultValue={selectedCode}
                >
                  {languageCodes.map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.language}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : (
          <div className="flex h-screen flex-col items-center justify-center">
            <PreJoin
              onError={(err) => console.error('PreJoin error:', err)}
              defaults={preJoinChoices}
              onSubmit={(values) => {
                console.log('PreJoin values:', values);
                setPreJoinChoices(values);
              }}
            />
          </div>
        )}
      </main>
    </>
  );
};

export default RoomPage;
