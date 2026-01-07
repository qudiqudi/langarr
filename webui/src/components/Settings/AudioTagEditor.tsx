import { Fragment, useState, useRef } from 'react';
import { Combobox, Transition } from '@headlessui/react';
import { ChevronUpDownIcon, CheckIcon, PlusIcon, XMarkIcon } from '@heroicons/react/20/solid';
import ISO6391 from 'iso-639-1';

export interface AudioTagRule {
    language: string;
    tagName: string;
}

interface AudioTagEditorProps {
    value: AudioTagRule[];
    onChange: (rules: AudioTagRule[]) => void;
    label?: string;
}

export default function AudioTagEditor({ value = [], onChange, label }: AudioTagEditorProps) {
    const [newLang, setNewLang] = useState('');
    const [newTag, setNewTag] = useState('');
    const [query, setQuery] = useState('');
    const comboButtonRef = useRef<HTMLButtonElement>(null);

    // Common languages to prioritize
    const commonLanguages = ['en', 'fr', 'es', 'de', 'it', 'ja', 'ko', 'zh', 'hi', 'ru', 'pt'];

    const allLanguages = ISO6391.getAllCodes()
        .map((code) => ({
            code,
            name: ISO6391.getName(code),
            nativeName: ISO6391.getNativeName(code),
        }))
        .sort((a, b) => {
            const aCommon = commonLanguages.indexOf(a.code);
            const bCommon = commonLanguages.indexOf(b.code);

            if (aCommon !== -1 && bCommon !== -1) return aCommon - bCommon;
            if (aCommon !== -1) return -1;
            if (bCommon !== -1) return 1;
            return a.name.localeCompare(b.name);
        });

    const filteredLanguages =
        query === ''
            ? allLanguages
            : allLanguages.filter((lang) =>
                lang.name.toLowerCase().includes(query.toLowerCase()) ||
                lang.code.toLowerCase().includes(query.toLowerCase()) ||
                lang.nativeName.toLowerCase().includes(query.toLowerCase())
            );

    // Get selected language name for display in input
    const getLangDisplay = (code: string) => {
        if (!code) return '';
        const l = allLanguages.find(x => x.code === code);
        return l ? `${l.name} (${l.code})` : code;
    };

    const handleAdd = () => {
        if (newLang && newTag) {
            if (value.some(rule => rule.language === newLang)) {
                // Prevent duplicate rules for same language
                // Could add toast here
                return;
            }
            onChange([...value, { language: newLang, tagName: newTag }]);
            setNewLang('');
            setNewTag('');
            setQuery('');
        }
    };

    const handleRemove = (langToRemove: string) => {
        onChange(value.filter(rule => rule.language !== langToRemove));
    };

    return (
        <div>
            {label && <label className="block text-sm font-medium leading-6 text-gray-300">{label}</label>}

            <div className="mt-2 grid grid-cols-12 gap-2">
                <div className="col-span-12 sm:col-span-5 relative">
                    <Combobox value={newLang} onChange={(val) => setNewLang(val || '')}>
                        {({ open }) => (
                            <>
                                <div className="relative w-full cursor-default overflow-hidden rounded-md bg-gray-800 text-left shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300 sm:text-sm">
                                    <Combobox.Input
                                        className="w-full border-none py-1.5 pl-3 pr-10 text-sm leading-5 text-gray-100 bg-gray-800 focus:ring-0"
                                        displayValue={(code: string) => getLangDisplay(code)}
                                        onChange={(event) => setQuery(event.target.value)}
                                        onClick={() => !open && comboButtonRef.current?.click()}
                                        placeholder="Select Language..."
                                    />
                                    <Combobox.Button
                                        ref={comboButtonRef}
                                        className="absolute inset-y-0 right-0 flex items-center pr-2"
                                    >
                                        <ChevronUpDownIcon
                                            className="h-5 w-5 text-gray-400"
                                            aria-hidden="true"
                                        />
                                    </Combobox.Button>
                                </div>
                                <Transition
                                    as={Fragment}
                                    leave="transition ease-in duration-100"
                                    leaveFrom="opacity-100"
                                    leaveTo="opacity-0"
                                    afterLeave={() => setQuery('')}
                                >
                                    <Combobox.Options
                                        anchor="bottom start"
                                        className="w-[var(--input-width)] max-h-60 overflow-auto rounded-md bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm z-50"
                                    >
                                        {filteredLanguages.length === 0 && query !== '' ? (
                                            <div className="relative cursor-default select-none py-2 px-4 text-gray-300">
                                                Nothing found.
                                            </div>
                                        ) : (
                                            filteredLanguages.map((lang) => (
                                                <Combobox.Option
                                                    key={lang.code}
                                                    className={({ active }) =>
                                                        `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-indigo-600 text-white' : 'text-gray-200'
                                                        }`
                                                    }
                                                    value={lang.code}
                                                >
                                                    {({ selected, active }) => (
                                                        <>
                                                            <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                                                                {lang.name} <span className="text-gray-400 text-xs ml-1">({lang.code})</span>
                                                            </span>
                                                            {selected ? (
                                                                <span className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-indigo-600'}`}>
                                                                    <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                                                </span>
                                                            ) : null}
                                                        </>
                                                    )}
                                                </Combobox.Option>
                                            ))
                                        )}
                                    </Combobox.Options>
                                </Transition>
                            </>
                        )}
                    </Combobox>
                </div>
                <div className="col-span-12 sm:col-span-5">
                    <input
                        type="text"
                        placeholder="Tag Name (e.g. audio-fr)"
                        className="block w-full rounded-md border-0 bg-gray-800 py-1.5 text-white shadow-sm ring-1 ring-inset ring-gray-700 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:text-sm sm:leading-6"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                    />
                </div>
                <div className="col-span-12 sm:col-span-2">
                    <button
                        type="button"
                        onClick={handleAdd}
                        disabled={!newLang || !newTag}
                        className="flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                    >
                        <PlusIcon className="h-5 w-5" aria-hidden="true" />
                    </button>
                </div>
            </div>

            <div className="mt-4 space-y-2">
                {value.length > 0 && (
                    <div className="rounded-md border border-gray-700 bg-gray-800/50">
                        <ul role="list" className="divide-y divide-gray-700 px-2">
                            {value.map((rule) => {
                                const langName = allLanguages.find(l => l.code === rule.language)?.name || rule.language;
                                return (
                                    <li key={rule.language} className="flex items-center justify-between py-2 text-sm">
                                        <div className="flex w-0 flex-1 items-center gap-4">
                                            <span className="font-medium text-gray-300">{langName}</span>
                                            <span className="text-gray-500">→</span>
                                            <span className="inline-flex items-center rounded-md bg-gray-700 px-2 py-1 text-xs font-medium text-gray-300 ring-1 ring-inset ring-gray-600">
                                                {rule.tagName}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemove(rule.language)}
                                            className="rounded-md p-1 text-gray-400 hover:text-red-400"
                                        >
                                            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
