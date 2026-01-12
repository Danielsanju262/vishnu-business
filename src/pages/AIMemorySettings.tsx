/**
 * AI Memory Settings - View, Edit, and Manage what the AI knows about you
 * Features:
 * - View all stored memories
 * - Add new facts/preferences
 * - Edit existing memories
 * - Delete memories
 * - Customize AI name and user name
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
    ArrowLeft,
    Brain,
    Plus,
    Trash2,
    Edit3,
    Save,
    User,
    Bot,
    Sparkles,
    Info,
    Lightbulb,
    Heart,
    FileText
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/toast-provider';
import {
    getActiveMemories,
    addMemory,
    updateMemory,
    deleteMemory,
    getAIConfig,
    setAIConfig,
    type AIMemory
} from '../lib/aiMemory';

// Bucket icons
const bucketIcons: Record<string, React.ReactNode> = {
    preference: <Heart size={14} className="text-pink-400" />,
    fact: <Lightbulb size={14} className="text-amber-400" />,
    context: <FileText size={14} className="text-blue-400" />
};

// Bucket colors
const bucketColors: Record<string, string> = {
    preference: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    fact: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    context: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
};

// Bucket descriptions
const bucketDescriptions: Record<string, string> = {
    preference: 'Your preferences (e.g., "Always remind me about EMI")',
    fact: 'Facts about you or your business',
    context: 'Context for conversations'
};

export default function AIMemorySettings() {
    const { toast } = useToast();

    // Memories state
    const [memories, setMemories] = useState<AIMemory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterBucket, setFilterBucket] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // AI Config state
    const [botName, setBotName] = useState('Via AI');
    const [userName, setUserName] = useState('');
    const [isEditingConfig, setIsEditingConfig] = useState(false);
    const [tempBotName, setTempBotName] = useState('');
    const [tempUserName, setTempUserName] = useState('');

    // Add/Edit modal state
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingMemory, setEditingMemory] = useState<AIMemory | null>(null);
    const [formContent, setFormContent] = useState('');
    const [formBucket, setFormBucket] = useState<'preference' | 'fact' | 'context'>('fact');

    // Load data
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [memoriesData, configData] = await Promise.all([
                getActiveMemories(),
                getAIConfig()
            ]);

            setMemories(memoriesData);
            if (configData.bot_name) setBotName(configData.bot_name);
            if (configData.user_name) setUserName(configData.user_name);
        } catch (error) {
            console.error('Error loading AI memory data:', error);
            toast('Failed to load AI memory', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Filter memories
    const filteredMemories = memories.filter(m => {
        if (filterBucket && m.bucket !== filterBucket) return false;
        if (searchQuery && !m.content.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    // Handle config save
    const handleSaveConfig = async () => {
        try {
            await setAIConfig('bot_name', tempBotName || 'Via AI');
            await setAIConfig('user_name', tempUserName);

            setBotName(tempBotName || 'Via AI');
            setUserName(tempUserName);
            setIsEditingConfig(false);
            toast('AI settings updated! 🤖', 'success');
        } catch (error) {
            toast('Failed to save settings', 'error');
        }
    };

    // Start editing config
    const handleStartEditConfig = () => {
        setTempBotName(botName);
        setTempUserName(userName);
        setIsEditingConfig(true);
    };

    // Reset form
    const resetForm = () => {
        setFormContent('');
        setFormBucket('fact');
        setEditingMemory(null);
    };

    // Open add modal
    const handleOpenAdd = () => {
        resetForm();
        setShowAddModal(true);
    };

    // Open edit modal
    const handleOpenEdit = (memory: AIMemory) => {
        setFormContent(memory.content);
        setFormBucket(memory.bucket);
        setEditingMemory(memory);
        setShowAddModal(true);
    };

    // Save memory
    const handleSaveMemory = async () => {
        if (!formContent.trim()) {
            toast('Please enter content', 'error');
            return;
        }

        try {
            if (editingMemory) {
                await updateMemory(editingMemory.id, formContent.trim());
                toast('Memory updated! 🧠', 'success');
            } else {
                await addMemory(formBucket, formContent.trim());
                toast('Memory added! The AI will remember this.', 'success');
            }

            setShowAddModal(false);
            resetForm();
            loadData();
        } catch (error) {
            toast('Failed to save memory', 'error');
        }
    };

    // Delete memory
    const handleDeleteMemory = async (id: string) => {
        try {
            await deleteMemory(id);
            toast('Memory deleted', 'info');
            setMemories(prev => prev.filter(m => m.id !== id));
        } catch (error) {
            toast('Failed to delete memory', 'error');
        }
    };

    return (
        <div className="min-h-screen bg-background p-3 md:p-4 pb-6 animate-in fade-in w-full md:max-w-2xl md:mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5 md:mb-6">
                <button
                    onClick={() => window.history.back()}
                    className="p-3 -ml-2 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 text-neutral-400 hover:text-white transition-all border border-transparent hover:border-white/10"
                >
                    <ArrowLeft size={20} strokeWidth={2.5} />
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-0.5 tracking-wide">
                        <Link to="/settings" className="hover:text-white transition-colors">Settings</Link>
                        <span className="text-neutral-600">/</span>
                        <span className="text-white font-semibold">AI Memory</span>
                    </div>
                    <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">AI Memory</h1>
                </div>
            </div>

            {/* AI Personalization Card */}
            <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-2xl p-4 mb-6">
                <div className="flex items-start gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                        <Sparkles size={24} className="text-white" />
                    </div>
                    <div className="flex-1">
                        <h2 className="font-bold text-white text-sm mb-0.5">AI Personalization</h2>
                        <p className="text-xs text-white/60">Customize how your AI assistant interacts with you</p>
                    </div>
                </div>

                {isEditingConfig ? (
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium text-white/70 mb-1 block flex items-center gap-1.5">
                                <Bot size={12} />
                                AI Name
                            </label>
                            <Input
                                value={tempBotName}
                                onChange={(e) => setTempBotName(e.target.value)}
                                placeholder="e.g., Via AI, Jarvis, Business Buddy"
                                className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-white/70 mb-1 block flex items-center gap-1.5">
                                <User size={12} />
                                Your Name
                            </label>
                            <Input
                                value={tempUserName}
                                onChange={(e) => setTempUserName(e.target.value)}
                                placeholder="How should the AI address you?"
                                className="bg-white/10 border-white/20 text-white placeholder:text-white/30"
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsEditingConfig(false)}
                                className="flex-1 border-white/20 text-white hover:bg-white/10"
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSaveConfig}
                                className="flex-1 bg-purple-600 hover:bg-purple-500"
                            >
                                <Save size={14} className="mr-1.5" />
                                Save
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                            <div className="flex items-center gap-2">
                                <Bot size={14} className="text-purple-400" />
                                <span className="text-xs text-white/70">AI Name:</span>
                            </div>
                            <span className="text-sm font-medium text-white">{botName}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                            <div className="flex items-center gap-2">
                                <User size={14} className="text-blue-400" />
                                <span className="text-xs text-white/70">Your Name:</span>
                            </div>
                            <span className="text-sm font-medium text-white">{userName || 'Not set'}</span>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleStartEditConfig}
                            className="w-full mt-2 border-white/20 text-white hover:bg-white/10"
                        >
                            <Edit3 size={14} className="mr-1.5" />
                            Edit Personalization
                        </Button>
                    </div>
                )}
            </div>

            {/* Memory Section */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Brain size={18} className="text-purple-400" />
                        <h2 className="font-bold text-white">What I Know About You</h2>
                    </div>
                    <Button
                        size="sm"
                        onClick={handleOpenAdd}
                        className="bg-purple-600 hover:bg-purple-500 h-8 px-3 text-xs"
                    >
                        <Plus size={14} className="mr-1" />
                        Add Memory
                    </Button>
                </div>

                {/* Info Box */}
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4">
                    <div className="flex items-start gap-2">
                        <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-blue-300">
                            These are facts and preferences the AI remembers about you. You can add, edit, or remove any information.
                        </p>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 mb-4">
                    <div className="flex-1">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search memories..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                        />
                    </div>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setFilterBucket(null)}
                            className={cn(
                                "px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                                filterBucket === null ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            All
                        </button>
                        {['preference', 'fact', 'context'].map(bucket => (
                            <button
                                key={bucket}
                                onClick={() => setFilterBucket(filterBucket === bucket ? null : bucket)}
                                className={cn(
                                    "px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1",
                                    filterBucket === bucket ? bucketColors[bucket] : "text-neutral-400 hover:text-white hover:bg-white/5"
                                )}
                            >
                                {bucketIcons[bucket]}
                                <span className="capitalize hidden sm:inline">{bucket}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}

                {/* Empty State */}
                {!isLoading && filteredMemories.length === 0 && (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
                            <Brain size={32} className="text-purple-400" />
                        </div>
                        <h3 className="font-bold text-white mb-2">
                            {memories.length === 0 ? 'No Memories Yet' : 'No Matches Found'}
                        </h3>
                        <p className="text-sm text-neutral-400 mb-4 max-w-xs mx-auto">
                            {memories.length === 0
                                ? 'Start adding facts about yourself or your business so the AI can remember them.'
                                : 'Try adjusting your search or filter.'}
                        </p>
                        {memories.length === 0 && (
                            <Button onClick={handleOpenAdd} className="bg-purple-600 hover:bg-purple-500">
                                <Plus size={16} className="mr-1.5" />
                                Add Your First Memory
                            </Button>
                        )}
                    </div>
                )}

                {/* Memories List */}
                {!isLoading && filteredMemories.length > 0 && (
                    <div className="space-y-2">
                        {filteredMemories.map((memory) => (
                            <div
                                key={memory.id}
                                className="bg-zinc-900/80 border border-white/10 rounded-xl p-3 hover:border-white/20 transition-all group"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className={cn(
                                                "text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 border",
                                                bucketColors[memory.bucket]
                                            )}>
                                                {bucketIcons[memory.bucket]}
                                                <span className="capitalize">{memory.bucket}</span>
                                            </span>
                                            <span className="text-[10px] text-neutral-500">
                                                {format(new Date(memory.created_at), 'MMM d, yyyy')}
                                            </span>
                                        </div>
                                        <p className="text-sm text-white">{memory.content}</p>
                                    </div>
                                    <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleOpenEdit(memory)}
                                            className="p-2 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                                            aria-label="Edit memory"
                                        >
                                            <Edit3 size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteMemory(memory.id)}
                                            className="p-2 rounded-lg hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-colors"
                                            aria-label="Delete memory"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add/Edit Memory Modal */}
            <Modal
                isOpen={showAddModal}
                onClose={() => { setShowAddModal(false); resetForm(); }}
                title={
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                            <Brain size={20} className="text-purple-400" />
                        </div>
                        <span className="font-bold text-white">{editingMemory ? 'Edit Memory' : 'Add Memory'}</span>
                    </div>
                }
            >
                <div className="space-y-4">
                    {!editingMemory && (
                        <div>
                            <label className="text-xs font-medium text-neutral-400 mb-2 block">Type</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['preference', 'fact', 'context'] as const).map((bucket) => (
                                    <button
                                        key={bucket}
                                        onClick={() => setFormBucket(bucket)}
                                        className={cn(
                                            "p-3 rounded-xl border text-center transition-all",
                                            formBucket === bucket
                                                ? bucketColors[bucket]
                                                : "bg-white/5 border-white/10 text-neutral-400 hover:border-white/20"
                                        )}
                                    >
                                        <div className="flex flex-col items-center gap-1">
                                            {bucketIcons[bucket]}
                                            <span className="text-xs capitalize font-medium">{bucket}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-neutral-500 mt-2">
                                {bucketDescriptions[formBucket]}
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-medium text-neutral-400 mb-1.5 block">Content *</label>
                        <textarea
                            value={formContent}
                            onChange={(e) => setFormContent(e.target.value)}
                            placeholder="e.g., My name is Daniel, I prefer weekly summaries, My EMI is 15000 on the 5th of every month"
                            rows={3}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => { setShowAddModal(false); resetForm(); }}
                            className="flex-1 border-white/20 hover:bg-white/10"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveMemory}
                            className="flex-1 bg-purple-600 hover:bg-purple-500"
                        >
                            {editingMemory ? 'Save Changes' : 'Add Memory'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
