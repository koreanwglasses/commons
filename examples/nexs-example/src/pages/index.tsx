import { useEffect } from "react";
import { useSub } from "@koreanwglasses/commons-nexs-client";
import { post } from "@koreanwglasses/nexs";

const Index = () => {
  const user = useSub("/api/user/current");

  useEffect(() => {
    if (user.data) {
      setTimeout(() => {
        let newUsername = (user.data.username as string) ?? "hello";
        if (newUsername.endsWith(" world"))
          newUsername = newUsername.slice(0, -6);
        else newUsername += " world";

        post("/api/user/current/setUsername", {
          username: newUsername,
        });
      }, 5000);
    }
  }, [user.data, user.data?.username]);

  return <pre>{user.data && JSON.stringify(user.data, null, 2)}</pre>;
};

export default Index;
