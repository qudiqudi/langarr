import { Fragment, useState, useRef } from 'react';
import { Combobox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';
import ISO6391 from 'iso-639-1';

interface LanguageSelectorProps {
    value: string[];
    onChange: (value: string[]) => void;
    label?: string;
    placeholder?: string;
}

export default function LanguageSelector({
    value,
    onChange,
    label = 'Languages',
    placeholder = 'Select languages...',
}: LanguageSelectorProps) {
    const [query, setQuery] = useState('');
    const comboButtonRef = useRef<HTMLButtonElement>(null);

    // Get all languages with code and name
    // Common languages to prioritize
    const commonLanguages = ['en', 'fr', 'es', 'de', 'it', 'ja', 'ko', 'zh', 'hi', 'ru', 'pt'];

    // Get all languages with code and name, sorted
    const allLanguages = ISO6391.getAllCodes()
        .map((code) => ({
            code,
            name: ISO6391.getName(code),
            nativeName: ISO6391.getNativeName(code),
        }))
        .sort((a, b) => {
            const aCommon = commonLanguages.indexOf(a.code);
            const bCommon = commonLanguages.indexOf(b.code);

            // Both common: sort by commonality index
            if (aCommon !== -1 && bCommon !== -1) return aCommon - bCommon;
            // One common: prioritize it
            if (aCommon !== -1) return -1;
            if (bCommon !== -1) return 1;
            // Neither common: alphabetical
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



    const removeLanguage = (code: string) => {
        onChange(value.filter((v) => v !== code));
    };

    return (
        <div className="w-full">
            {label && <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>}

            <div className="flex flex-wrap gap-2 mb-2">
                {value.map((code) => (
                    <span
                        key={code}
                        className="inline-flex items-center rounded-md bg-indigo-500/10 px-2 py-1 text-xs font-medium text-indigo-400 ring-1 ring-inset ring-indigo-500/20"
                    >
                        {ISO6391.getName(code)} ({code})
                        <button
                            type="button"
                            className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 focus:bg-indigo-500/30 focus:text-indigo-300 focus:outline-none"
                            onClick={() => removeLanguage(code)}
                        >
                            <span className="sr-only">Remove {code}</span>
                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                            </svg>
                        </button>
                    </span>
                ))}
            </div>

            <Combobox value={value} onChange={onChange} multiple>
                {({ open }) => (
                    <>
                        <div className="relative mt-1">
                            <div className="relative w-full cursor-default overflow-hidden rounded-md bg-gray-800 text-left shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300 sm:text-sm">
                                <Combobox.Input
                                    className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-100 bg-gray-800 focus:ring-0"
                                    placeholder={placeholder}
                                    onChange={(event) => setQuery(event.target.value)}
                                    onClick={() => !open && comboButtonRef.current?.click()}
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
                                    className="absolute mt-1 w-full max-h-60 overflow-auto rounded-md bg-gray-700 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm z-50"
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
                                                        <span
                                                            className={`block truncate ${selected ? 'font-medium' : 'font-normal'
                                                                }`}
                                                        >
                                                            {lang.name} <span className="text-gray-400 text-xs ml-1">({lang.code})</span>
                                                        </span>
                                                        {selected ? (
                                                            <span
                                                                className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-indigo-400'
                                                                    }`}
                                                            >
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
                        </div>
                    </>
                )}
            </Combobox>
        </div>
    );
}
