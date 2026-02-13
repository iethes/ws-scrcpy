class RawHTML {
    constructor(public html: string) {}
}

export const rawHtml = (html: string): RawHTML => new RawHTML(html);

function htmlValue(value: unknown): string {
    if (value instanceof RawHTML) {
        return value.html;
    }
    if (value instanceof HTMLTemplateElement) {
        return value.innerHTML;
    }
    if (typeof value === 'undefined') {
        return 'undefined';
    }
    if (value === null) {
        return 'null';
    }
    const e = document.createElement('dummy');
    e.innerText = String(value);
    return e.innerHTML;
}

export const html = function html(
    strings: TemplateStringsArray,
    ...values: ReadonlyArray<unknown>
): HTMLTemplateElement {
    const template = document.createElement('template') as HTMLTemplateElement;
    const result = values.reduce((acc, v, idx) => {
        const nextString = strings[idx + 1] ?? '';
        return acc + htmlValue(v) + nextString;
    }, strings[0]);
    template.innerHTML = (result as string).toString();
    return template;
};
