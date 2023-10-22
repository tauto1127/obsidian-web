import React, { useEffect, useState } from "react";

import classnames from "classnames";
import ReactDOM from "react-dom";
import Turndown from "turndown";
import { Readability } from "@mozilla/readability";

import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import ThemeProvider from "@mui/system/ThemeProvider";
import IconButton from "@mui/material/IconButton";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CircularProgress from "@mui/material/CircularProgress";
import MaterialAlert from "@mui/material/Alert";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";

import SendIcon from "@mui/icons-material/SaveAlt";

import styles from "./styles.css";

import { PurpleTheme } from "./theme";
import Alert from "./components/Alert";
import {
  AlertStatus,
  ContentCache,
  ExtensionLocalSettings,
  ExtensionSyncSettings,
  OutputPreset,
  SearchJsonResponseItem,
  StatusResponse,
} from "./types";
import {
  getLocalSettings,
  getSyncSettings,
  obsidianRequest,
  compileTemplate,
  getUrlMentions,
  getContentCache,
  getPageMetadata,
  setContentCache,
  normalizeCacheUrl,
  checkHasHostPermission,
  requestHostPermission,
} from "./utils";
import RequestParameters from "./components/RequestParameters";
import { TurndownConfiguration } from "./constants";
import MentionNotice from "./components/MentionNotice";
import { Stack } from "@mui/material";

const ROOT_CONTAINER_ID = "obsidian-web-container";

const Popup = () => {
  const [status, setStatus] = useState<AlertStatus>();
  const [displayed, setDisplayed] = useState<boolean>(false);

  const [sandboxReady, setSandboxReady] = useState<boolean>(false);
  const [obsidianUnavailable, setObsidianUnavailable] =
    useState<boolean>(false);
  const [ready, setReady] = useState<boolean>(false);
  const [cacheData, setCacheData] = useState<ContentCache>({});
  const [cacheAvailable, setCacheAvailable] = useState<boolean>(false);

  const [host, setHost] = useState<string | null>(null);
  const [hasHostPermission, setHasHostPermission] = useState<boolean | null>(
    null
  );
  const [apiKey, setApiKey] = useState<string>("");
  const [insecureMode, setInsecureMode] = useState<boolean>(false);

  const [url, setUrl] = useState<string>("");
  const [pageTitle, setPageTitle] = useState<string>("");
  const [selection, setSelection] = useState<string>("");
  const [pageContent, setPageContent] = useState<string>("");

  const [suggestionAccepted, setSuggestionAccepted] = useState<boolean>(false);
  const [mentions, setMentions] = useState<SearchJsonResponseItem[]>([]);
  const [directReferences, setDirectReferences] = useState<
    SearchJsonResponseItem[]
  >([]);
  const [directReferenceMessages, setDirectReferenceMessages] = useState<
    string[]
  >([]);

  const [searchEnabled, setSearchEnabled] = useState<boolean>(false);
  const [searchMatchMentionTemplate, setSearchMatchMentionTemplate] =
    useState<string>("");
  const [searchMatchDirectTemplate, setSearchMatchDirectTemplate] =
    useState<string>("");

  const [method, setMethod] = useState<OutputPreset["method"]>("post");
  const [overrideUrl, setOverrideUrl] = useState<string>();
  const [compiledUrl, setCompiledUrl] = useState<string>("");
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [compiledContent, setCompiledContent] = useState<string>("");

  const [articleTitle, setArticleTitle] = useState<string>();
  const [articleLength, setArticleLength] = useState<number>();
  const [articleExcerpt, setArticleExcerpt] = useState<string>();
  const [articleByline, setArticleByline] = useState<string>();
  const [articleDir, setArticleDir] = useState<string>();
  const [articleSiteName, setArticleSiteName] = useState<string>();

  const [presets, setPresets] = useState<OutputPreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<number>(0);

  const [displayState, setDisplayState] = useState<
    "welcome" | "form" | "error" | "loading" | "alert" | "permission"
  >("loading");

  const turndown = new Turndown(TurndownConfiguration);

  useEffect(() => {
    if (apiKey.length === 0) {
      setDisplayState("welcome");
      return;
    }
    if (!hasHostPermission) {
      setDisplayState("permission");
      return;
    }
    if (status) {
      setDisplayState("alert");
      return;
    }
    if (obsidianUnavailable) {
      setDisplayState("error");
      return;
    }
    if (!ready) {
      setDisplayState("loading");
      return;
    }
    setDisplayState("form");
  }, [status, apiKey, obsidianUnavailable, ready, hasHostPermission]);

  useEffect(() => {
    window.addEventListener(
      "message",
      () => {
        setSandboxReady(true);
      },
      {
        once: true,
      }
    );
    setDisplayed(true);
  }, []);

  useEffect(() => {
    if (!apiKey) {
      return;
    }

    async function handle() {
      try {
        if (!host) {
          throw new Error("No hostname configured");
        }

        const request = await obsidianRequest(
          host,
          apiKey,
          "/",
          { method: "get" },
          insecureMode
        );
        const result: StatusResponse = await request.json();
        if (
          result.status === "OK" &&
          result.service.includes("Obsidian Local REST API")
        ) {
          setObsidianUnavailable(false);
        } else {
          setObsidianUnavailable(true);
        }
      } catch (e) {
        setObsidianUnavailable(true);
      }
    }
    handle();
  }, [apiKey]);

  useEffect(() => {
    async function handle() {
      let syncSettings: ExtensionSyncSettings;
      let localSettings: ExtensionLocalSettings;

      try {
        localSettings = await getLocalSettings(chrome.storage.local);
      } catch (e) {
        setStatus({
          severity: "error",
          title: "Error",
          message: "Could not get local settings!",
        });
        return;
      }

      try {
        syncSettings = await getSyncSettings(chrome.storage.sync);
        setPresets(syncSettings.presets);
      } catch (e) {
        setStatus({
          severity: "error",
          title: "Error",
          message: "Could not get settings!",
        });
        return;
      }

      setHost(localSettings.host);
      setInsecureMode(localSettings.insecureMode ?? false);
      setApiKey(localSettings.apiKey);
      setSearchEnabled(syncSettings.searchEnabled);
      setSearchMatchMentionTemplate(syncSettings.searchMatchMentionTemplate);
      setSearchMatchDirectTemplate(syncSettings.searchMatchDirectTemplate);
    }
    handle();
  }, []);

  useEffect(() => {
    /*
    if (host) {
      checkHasHostPermission(host).then((hasPermission) => {
        setHasHostPermission(hasPermission);
      });
    }*/
  }, [host]);

  useEffect(() => {
    if (!url) {
      return;
    }

    async function handle() {
      const cache = await getContentCache(chrome.storage.local);
      if (cache) {
        setCacheData(cache);
        try {
          if (
            cache.url &&
            normalizeCacheUrl(cache.url) === normalizeCacheUrl(url)
          ) {
            setCacheAvailable(true);
            setSelectedPreset(-1);
          }
        } catch (e) {
          setCacheData({});
          setCacheAvailable(false);
        }
      }
    }

    handle();
  }, [url]);

  useEffect(() => {
    async function handle() {
      let tab: chrome.tabs.Tab;
      try {
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        tab = tabs[0];
      } catch (e) {
        setStatus({
          severity: "error",
          title: "Error",
          message: "Could not get current tab!",
        });
        return;
      }
      if (!tab.id) {
        return;
      }

      let selectedText: string;
      try {
        const selectedTextInjected = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const selection = window.getSelection();
            if (!selection) {
              return "";
            }
            const contents = selection.getRangeAt(0).cloneContents();
            const node = document.createElement("div");
            node.appendChild(contents.cloneNode(true));
            return node.innerHTML;
          },
        });
        const selectionReadability = htmlToReadabilityData(
          selectedTextInjected[0].result,
          tab.url ?? ""
        );
        selectedText = readabilityDataToMarkdown(selectionReadability);
      } catch (e) {
        selectedText = "";
      }

      let pageContent: string;
      try {
        const pageContentInjected = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.document.body.innerHTML,
        });
        const pageReadability = htmlToReadabilityData(
          pageContentInjected[0].result,
          tab.url ?? ""
        );
        if (pageReadability) {
          setArticleTitle(pageReadability.title);
          setArticleLength(pageReadability.length);
          setArticleExcerpt(pageReadability.excerpt);
          setArticleByline(pageReadability.byline);
          setArticleDir(pageReadability.dir);
          setArticleSiteName(pageReadability.siteName);
        } else {
          setArticleTitle(undefined);
          setArticleLength(undefined);
          setArticleExcerpt(undefined);
          setArticleByline(undefined);
          setArticleDir(undefined);
          setArticleSiteName(undefined);
        }
        pageContent = readabilityDataToMarkdown(pageReadability);
      } catch (e) {
        pageContent = "";
        setArticleTitle(undefined);
        setArticleLength(undefined);
        setArticleExcerpt(undefined);
        setArticleByline(undefined);
        setArticleDir(undefined);
        setArticleSiteName(undefined);
      }

      setUrl(tab.url ?? "");
      setPageTitle(tab.title ?? "");
      setSelection(selectedText);
      setPageContent(pageContent);
    }
    handle();
  }, []);

  useEffect(() => {
    setDirectReferenceMessages([]);

    async function handle() {
      const messages: string[] = [];

      if (!host) {
        return;
      }

      for (const ref of directReferences) {
        const meta = await getPageMetadata(
          host,
          apiKey,
          insecureMode,
          ref.filename
        );

        if (typeof meta.frontmatter["web-badge-message"] === "string") {
          messages.push(meta.frontmatter["web-badge-message"]);
        }
      }

      setDirectReferenceMessages(messages);
    }

    handle();
  }, [directReferences]);

  useEffect(() => {
    if (!searchEnabled) {
      return;
    }

    async function handle() {
      if (!host) {
        return;
      }
      const allMentions = await getUrlMentions(host, apiKey, insecureMode, url);

      setMentions(allMentions.mentions);
      setDirectReferences(allMentions.direct);
    }

    handle();
  }, [url]);

  useEffect(() => {
    if (!sandboxReady) {
      return;
    }

    async function handle() {
      const preset = presets[selectedPreset];

      const context = {
        page: {
          url: url,
          tiitle: pageTitle,
          selectedText: selection,
          content: pageContent,
        },
        article: {
          title: articleTitle,
          length: articleLength,
          excerpt: articleExcerpt,
          byline: articleByline,
          dir: articleDir,
          siteName: articleSiteName,
        },
      };

      if (overrideUrl) {
        setCompiledUrl(overrideUrl);
        setOverrideUrl(undefined);
      } else {
        const compiledUrl = await compileTemplate(preset.urlTemplate, context);
        setCompiledUrl(compiledUrl);
      }
      const compiledContent = await compileTemplate(
        preset.contentTemplate,
        context
      );

      setMethod(preset.method as OutputPreset["method"]);
      setHeaders(preset.headers);
      setCompiledContent(compiledContent);
      setReady(true);
    }

    if (selectedPreset === -1) {
      if (cacheData.method) {
        setMethod(cacheData.method);
      }
      if (cacheData.compiledUrl) {
        setCompiledUrl(cacheData.compiledUrl);
      }
      if (cacheData.headers) {
        setHeaders(cacheData.headers);
      }
      if (cacheData.compiledContent) {
        setCompiledContent(cacheData.compiledContent);
      }
      setReady(true);
    } else {
      handle();
    }
  }, [
    sandboxReady,
    selectedPreset,
    presets,
    url,
    pageTitle,
    selection,
    pageContent,
  ]);

  useEffect(() => {
    if (!url) {
      return;
    }

    setContentCache(chrome.storage.local, {
      url,
      method,
      compiledUrl,
      headers,
      compiledContent,
    });
  }, [url, method, compiledUrl, headers, compiledContent]);

  const htmlToReadabilityData = (
    html: string,
    baseUrl: string
  ): ReturnType<Readability["parse"]> => {
    const tempDoc = document.implementation.createHTMLDocument();
    const base = tempDoc.createElement("base");
    base.href = baseUrl;
    tempDoc.head.append(base);
    tempDoc.body.innerHTML = html;
    const reader = new Readability(tempDoc);
    return reader.parse();
  };

  const readabilityDataToMarkdown = (
    data: ReturnType<Readability["parse"]>
  ): string => {
    if (data) {
      return turndown.turndown(data.content);
    }
    return "";
  };

  const sendToObsidian = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab.id) {
      return;
    }

    const requestHeaders = {
      ...headers,
      "Content-Type": "text/markdown",
    };
    const request: RequestInit = {
      method: method,
      body: compiledContent,
      headers: requestHeaders,
    };
    let result: Response;

    if (host === null) {
      console.error("Cannot send to Obsidian; no hostname set.");
      return;
    }

    try {
      result = await obsidianRequest(
        host,
        apiKey,
        compiledUrl,
        request,
        insecureMode
      );
    } catch (e) {
      setStatus({
        severity: "error",
        title: "Error",
        message: `Could not send content to Obsidian: ${e}`,
      });
      return;
    }
    const text = await result.text();

    if (result.status < 300) {
      setStatus({
        severity: "success",
        title: "All done!",
        message: "Your content was sent to Obsidian successfully.",
      });
      setTimeout(() => window.close(), 2000);
    } else {
      try {
        const body = JSON.parse(text);
        setStatus({
          severity: "error",
          title: "Error",
          message: `Could not send content to Obsidian: (Error Code ${body.errorCode}) ${body.message}`,
        });
      } catch (e) {
        setStatus({
          severity: "error",
          title: "Error",
          message: `Could not send content to Obsidian!: (Status Code ${result.status}) ${text}`,
        });
      }
    }
  };

  const acceptSuggestion = (filename: string, template: string) => {
    const matchingPresetIdx = presets.findIndex(
      (preset) => preset.name === template
    );
    setOverrideUrl(`/vault/${filename}`);
    setSelectedPreset(matchingPresetIdx);
    setSuggestionAccepted(true);
  };

  const onFinished = () => {
    setDisplayed(false);
    setTimeout(() => {
      document.getElementById(ROOT_CONTAINER_ID)?.remove();
    }, 300);
  };

  return (
    <ThemeProvider theme={PurpleTheme}>
      <div
        className={classnames("background", { displayed })}
        onClick={() => onFinished()}
      >
        <div
          className="popup"
          onClick={(evt) => {
            evt.stopPropagation();
          }}
        >
          {displayState === "welcome" && (
            <>
              <MaterialAlert severity="success">
                <Stack>
                  <Typography>
                    Thanks for installing Obsidian Web! Obsidian Web needs some
                    information from you before it can connect to your Obsidian
                    instance.
                  </Typography>
                  <div className="submit">
                    <Button
                      target="_blank"
                      variant="contained"
                      href={`chrome-extension://${chrome.runtime.id}/options.html`}
                    >
                      Go to settings
                    </Button>
                  </div>
                </Stack>
              </MaterialAlert>
            </>
          )}
          {displayState === "permission" && host && (
            <MaterialAlert severity="warning">
              <Typography>
                Obsidian Web needs permission to access Obsidian on '{host}'.
              </Typography>
              <div className="submit">
                <Button
                  target="_blank"
                  variant="outlined"
                  href={`chrome-extension://${chrome.runtime.id}/options.html`}
                >
                  Go to settings
                </Button>
                <Button
                  variant="contained"
                  onClick={() =>
                    requestHostPermission(host).then((result) => {
                      setHasHostPermission(result);
                    })
                  }
                >
                  Grant
                </Button>
              </div>
            </MaterialAlert>
          )}
          {displayState === "alert" && status && <Alert value={status} />}
          {displayState === "error" && (
            <MaterialAlert severity="error">
              Could not connect to Obsidian! Make sure Obsidian is running and
              that the Obsidian Local REST API plugin is enabled.
            </MaterialAlert>
          )}
          {displayState === "loading" && (
            <div className="loading">
              {" "}
              <Typography paragraph={true}>
                Gathering page information...
              </Typography>
              <CircularProgress />
            </div>
          )}
          {displayState === "form" && (
            <>
              <div className="option">
                <div className="option-value">
                  <Select
                    label="Preset"
                    value={selectedPreset}
                    fullWidth={true}
                    onChange={(event) =>
                      setSelectedPreset(
                        typeof event.target.value === "number"
                          ? event.target.value
                          : parseInt(event.target.value, 10)
                      )
                    }
                  >
                    {cacheAvailable && (
                      <MenuItem key={"cached"} value={-1}>
                        <i>Saved Draft</i>
                      </MenuItem>
                    )}
                    {presets.map((preset, idx) => (
                      <MenuItem key={preset.name} value={idx}>
                        {preset.name}
                      </MenuItem>
                    ))}
                  </Select>
                  <IconButton
                    className="send-to-obsidian"
                    color="primary"
                    size="large"
                    disabled={!ready}
                    onClick={sendToObsidian}
                    title="Send to Obsidian"
                  >
                    <SendIcon />
                  </IconButton>
                </div>
              </div>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Entry Details</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <RequestParameters
                    method={method}
                    url={compiledUrl}
                    headers={headers}
                    content={compiledContent}
                    onChangeMethod={setMethod}
                    onChangeUrl={setCompiledUrl}
                    onChangeHeaders={setHeaders}
                    onChangeContent={setCompiledContent}
                  />
                </AccordionDetails>
              </Accordion>
              {!suggestionAccepted && host && (
                <>
                  {(mentions.length > 0 || directReferences.length > 0) && (
                    <div className="mentions">
                      {directReferences.map((ref) => (
                        <MentionNotice
                          key={ref.filename}
                          type="direct"
                          host={host}
                          apiKey={apiKey}
                          insecureMode={insecureMode}
                          templateSuggestion={searchMatchDirectTemplate}
                          mention={ref}
                          presets={presets}
                          acceptSuggestion={acceptSuggestion}
                          directReferenceMessages={directReferenceMessages}
                        />
                      ))}
                      {mentions
                        .filter(
                          (ref) =>
                            !directReferences.find(
                              (d) => d.filename === ref.filename
                            )
                        )
                        .map((ref) => (
                          <MentionNotice
                            key={ref.filename}
                            type="mention"
                            host={host}
                            apiKey={apiKey}
                            insecureMode={insecureMode}
                            templateSuggestion={searchMatchMentionTemplate}
                            mention={ref}
                            presets={presets}
                            acceptSuggestion={acceptSuggestion}
                            directReferenceMessages={directReferenceMessages}
                          />
                        ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </ThemeProvider>
  );
};

const root = document.createElement("div");
root.id = ROOT_CONTAINER_ID;
const shadowContainer = root.attachShadow({ mode: "open" });

const popupRoot = document.createElement("div");
shadowContainer.appendChild(popupRoot);

const styleResetRoot = document.createElement("style");
styleResetRoot.innerHTML = ":host {all: initial;}";
shadowContainer.appendChild(styleResetRoot);

const emotionRoot = document.createElement("style");
shadowContainer.appendChild(emotionRoot);

const stylesRoot = document.createElement("style");
stylesRoot.innerHTML = styles;
shadowContainer.appendChild(stylesRoot);

const cache = createCache({
  key: "obsidian-web",
  prepend: true,
  container: emotionRoot,
});

document.body.prepend(root);

ReactDOM.render(
  <React.StrictMode>
    <CacheProvider value={cache}>
      {/* Allows us to be sure we're positioned far above the page zIndex" */}
      <div style={{ position: "relative", zIndex: "999999999" }}>
        <Popup />
      </div>
    </CacheProvider>
  </React.StrictMode>,
  popupRoot
);
