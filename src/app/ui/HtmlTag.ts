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
    e.innerText = value.toString();
    return e.innerHTML;
}

export const html = function html(
    strings: TemplateStringsArray,
    ...values: ReadonlyArray<unknown>
): HTMLTemplateElement {
    const template = document.createElement('template') as HTMLTemplateElement;
    template.innerHTML = values.reduce((acc, v, idx) => acc + htmlValue(v) + strings[idx + 1], strings[0]).toString();
    return template;
};
