
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  isDark: false,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "tuma-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>("light");

  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "light") {
      root.classList.add("light");
      setIsDark(false);
      return;
    }

    root.classList.add(theme);
    setIsDark(theme === "dark");
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== "system") return;
    
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    
    const handleChange = () => {
      const root = window.document.documentElement;
      const systemTheme = mediaQuery.matches ? "dark" : "light";
      
      root.classList.remove("light", "dark");
      root.classList.add(systemTheme);
      setIsDark(systemTheme === "dark");
    };
    
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const value = {
    theme,
    isDark,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
