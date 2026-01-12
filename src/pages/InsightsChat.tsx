import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    ArrowLeft,
    Send,
    MessageCircle,
    Sparkles,
    Trash2,
} from "lucide-react";
import { cn } from "../lib/utils";
import { QUICK_QUESTIONS } from "../types/insightTypes";
import { enhancedChatWithAI } from "../lib/enhancedAI";
import {
    getAIConfig,
    getOrCreateActiveSession,
    getChatMessages,
    addChatMessage,
    clearChatSession
} from "../lib/aiMemory";

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export default function InsightsChat() {
    const navigate = useNavigate();
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [botName, setBotName] = useState("Via AI");
    const [userName, setUserName] = useState("");
    const [sessionId, setSessionId] = useState<string | null>(null);

    // Initialize tokens - Persist until API reset time
    const [totalTokensUsed, setTotalTokensUsed] = useState(() => {
        const storedResetTime = localStorage.getItem('ai_reset_timestamp_v2');
        const storedTokens = localStorage.getItem('ai_tokens_used_v2');

        // If we have a known reset time and we've passed it, reset the counter
        if (storedResetTime) {
            const resetTime = Number(storedResetTime);
            if (Date.now() > resetTime) {
                // Reset limit reached
                localStorage.setItem('ai_tokens_used_v2', '0');
                localStorage.removeItem('ai_reset_timestamp_v2'); // Clear old reset time
                return 0;
            }
        }

        // Otherwise return accumulated tokens
        return Number(storedTokens) || 0;
    });

    const [tokenLimit, setTokenLimit] = useState(() => {
        return Number(localStorage.getItem('ai_token_limit_v2')) || 1000000;
    });

    const [resetTimestamp, setResetTimestamp] = useState<number | null>(() => {
        const stored = localStorage.getItem('ai_reset_timestamp_v2');
        return stored ? Number(stored) : null;
    });

    const chatContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load AI Config and existing session on mount
    useEffect(() => {
        const loadData = async () => {
            try {
                // Load config
                const config = await getAIConfig();
                if (config.bot_name) setBotName(config.bot_name);
                if (config.user_name) setUserName(config.user_name);

                // Load existing session (shared with widget)
                const session = await getOrCreateActiveSession();
                if (session) {
                    setSessionId(session.id);
                    const history = await getChatMessages(session.id);
                    setChatMessages(history.map(m => ({
                        id: m.id,
                        role: m.role as 'user' | 'assistant',
                        content: m.content,
                        timestamp: new Date(m.created_at)
                    })));
                }
            } catch (error) {
                console.error("Failed to load AI data", error);
            }
        };
        loadData();
    }, []);

    // Persist token usage
    useEffect(() => {
        localStorage.setItem('ai_tokens_used_v2', String(totalTokensUsed));
    }, [totalTokensUsed]);

    // Persist token limit
    useEffect(() => {
        localStorage.setItem('ai_token_limit_v2', String(tokenLimit));
    }, [tokenLimit]);

    // Persist reset timestamp
    useEffect(() => {
        if (resetTimestamp) {
            localStorage.setItem('ai_reset_timestamp_v2', String(resetTimestamp));
        }
    }, [resetTimestamp]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Helper to process AI response meta
    const processAIResponse = (response: any) => {
        if (response.usage.limit > 0) setTokenLimit(response.usage.limit);

        if (response.usage.resetInSeconds) {
            const val = response.usage.resetInSeconds;
            // If val is huge, it's epoch. If small, it's seconds delta.
            const isEpoch = val > 1000000000;
            const targetTime = isEpoch ? val * 1000 : Date.now() + (val * 1000);
            setResetTimestamp(targetTime);
        }
    };

    // Handle quick question
    const handleQuickQuestion = async (queryType: string) => {
        setIsChatLoading(true);
        const question = QUICK_QUESTIONS.find(q => q.query === queryType)?.label || queryType;

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: question,
            timestamp: new Date(),
        };
        setChatMessages(prev => [...prev, userMsg]);

        // Save user message to database
        if (sessionId) {
            await addChatMessage(sessionId, 'user', question);
        }

        try {
            const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
            const response = await enhancedChatWithAI(question, history, botName, userName);
            setTotalTokensUsed(prev => prev + response.usage.used);
            processAIResponse(response);

            const aiMsg: ChatMessage = {
                id: `ai-${Date.now()}`,
                role: 'assistant',
                content: response.text,
                timestamp: new Date(),
            };
            setChatMessages(prev => [...prev, aiMsg]);

            // Save AI response to database
            if (sessionId) {
                await addChatMessage(sessionId, 'assistant', response.text);
            }
        } catch {
            const errorMsg: ChatMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: "Oops! Something went wrong. Let me try again... 🙈",
                timestamp: new Date(),
            };
            setChatMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsChatLoading(false);
        }
    };

    // Handle chat submit
    const handleChatSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!chatInput.trim() || isChatLoading) return;

        const message = chatInput.trim();
        setChatInput("");
        setIsChatLoading(true);

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: message,
            timestamp: new Date(),
        };
        setChatMessages(prev => [...prev, userMsg]);

        // Save user message to database
        if (sessionId) {
            await addChatMessage(sessionId, 'user', message);
        }

        try {
            // Pass the current history to the AI
            const history = chatMessages.map(m => ({ role: m.role, content: m.content }));
            const response = await enhancedChatWithAI(message, history, botName, userName);
            setTotalTokensUsed(prev => prev + response.usage.used);
            processAIResponse(response);

            const aiMsg: ChatMessage = {
                id: `ai-${Date.now()}`,
                role: 'assistant',
                content: response.text,
                timestamp: new Date(),
            };
            setChatMessages(prev => [...prev, aiMsg]);

            // Save AI response to database
            if (sessionId) {
                await addChatMessage(sessionId, 'assistant', response.text);
            }
        } catch {
            const errorMsg: ChatMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: "Hmm, I couldn't understand that. Try asking about sales, expenses, or payments! 💭",
                timestamp: new Date(),
            };
            setChatMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsChatLoading(false);
        }
    };

    const clearChat = async () => {
        if (sessionId) {
            await clearChatSession(sessionId);
        }
        setChatMessages([]);
    };

    const getResetText = () => {
        if (!resetTimestamp) return "(Daily Reset)";
        // If reset time is in the past, default to Daily
        if (resetTimestamp < Date.now()) return "(Daily Reset)";
        return `(Resets ${format(new Date(resetTimestamp), 'MMM d, h:mm a')})`;
    };

    return (
        <div className="fixed inset-0 flex flex-col bg-background">
            {/* Header */}
            <header className="shrink-0 px-4 py-3 border-b border-white/5 bg-zinc-900/50 backdrop-blur-xl">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 -ml-2 rounded-full hover:bg-white/10 active:bg-white/15 transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center">
                                <Sparkles size={18} className="text-purple-400" />
                            </div>
                            <div>
                                <h1 className="font-semibold text-foreground leading-none mb-1">{botName}</h1>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded">Mistral Large</span>
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                        <span>{totalTokensUsed.toLocaleString()} / {tokenLimit.toLocaleString()}</span>
                                        <span className="opacity-50">{getResetText()}</span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    {chatMessages.length > 0 && (
                        <button
                            onClick={clearChat}
                            className="p-2 rounded-full hover:bg-white/10 active:bg-white/15 text-muted-foreground hover:text-foreground transition-colors"
                            title="Clear chat"
                        >
                            <Trash2 size={18} />
                        </button>
                    )}
                </div>
            </header>

            {/* Chat Messages */}
            <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
            >
                {chatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-6">
                        <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mb-4">
                            <MessageCircle size={32} className="text-purple-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground mb-1">
                            Hey! I'm {botName} 👋
                        </h2>
                        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                            Ask me anything about your sales, expenses, payments, or customers. I know everything about your business!
                        </p>

                        {/* Quick Questions */}
                        <div className="w-full max-w-sm space-y-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                Try asking...
                            </p>
                            {QUICK_QUESTIONS.map((q) => (
                                <button
                                    key={q.query}
                                    onClick={() => handleQuickQuestion(q.query)}
                                    disabled={isChatLoading}
                                    className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 active:bg-white/15 rounded-xl text-left transition-all border border-white/5"
                                >
                                    <span className="text-lg">{q.icon}</span>
                                    <span className="text-sm font-medium text-foreground">{q.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        {chatMessages.map((msg) => (
                            <div
                                key={msg.id}
                                className={cn(
                                    "flex",
                                    msg.role === 'user' ? "justify-end" : "justify-start"
                                )}
                            >
                                <div
                                    className={cn(
                                        "max-w-[85%] p-3.5 text-sm",
                                        msg.role === 'user'
                                            ? "bg-purple-600 text-white rounded-2xl rounded-br-md"
                                            : "bg-zinc-800 text-foreground rounded-2xl rounded-bl-md border border-white/5"
                                    )}
                                >
                                    <div className={cn(
                                        "prose prose-sm max-w-none break-words",
                                        // Markdown overrides for better styling
                                        msg.role === 'user' ? "prose-invert text-white" : "prose-invert text-zinc-100",
                                        "prose-p:leading-relaxed prose-p:my-1 first:prose-p:mt-0 last:prose-p:mb-0",
                                        "prose-headings:text-inherit prose-headings:font-semibold prose-headings:my-2",
                                        "prose-strong:text-inherit prose-strong:font-bold",
                                        "prose-ul:my-2 prose-ul:list-disc prose-ul:pl-4",
                                        "prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-4",
                                        "prose-li:my-0.5",
                                        "prose-code:px-1 prose-code:py-0.5 prose-code:bg-black/20 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none",
                                        "prose-pre:p-2 prose-pre:bg-black/30 prose-pre:rounded-lg prose-pre:my-2"
                                    )}>
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                // Ensure links open in new tab
                                                a: ({ node, ...props }) => (
                                                    <a {...props} target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-300" />
                                                ),
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>

                                    <div className={cn(
                                        "text-[10px] mt-2 flex justify-end opacity-70",
                                        msg.role === 'user' ? "text-purple-100" : "text-muted-foreground"
                                    )}>
                                        {format(msg.timestamp, 'h:mm a')}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {isChatLoading && (
                            <div className="flex justify-start">
                                <div className="p-4 bg-zinc-800 rounded-2xl rounded-bl-md border border-white/5">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" />
                                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>



            {/* Input */}
            <form
                onSubmit={handleChatSubmit}
                className="shrink-0 p-4 border-t border-white/5 bg-zinc-900/50 backdrop-blur-xl"
            >
                <div className="flex items-center gap-3">
                    <input
                        ref={inputRef}
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Ask me anything..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 py-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/30"
                        disabled={isChatLoading}
                    />
                    <button
                        type="submit"
                        disabled={!chatInput.trim() || isChatLoading}
                        className="p-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/30 disabled:cursor-not-allowed rounded-full text-white transition-all shrink-0"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </form>
        </div>
    );
}
