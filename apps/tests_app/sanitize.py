"""Server-side HTML clean-up for question/answer text written in the rich editor."""
import nh3

# What the editor produces: formatting, colour, alignment, lists, tables
TAGS = {
    'p', 'div', 'span', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'font',
    'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'pre', 'code', 'hr',
}
ATTRIBUTES = {
    '*': {'style'},
    'font': {'color', 'size'},
    'div': {'align'}, 'p': {'align'},
    'td': {'colspan', 'rowspan'}, 'th': {'colspan', 'rowspan'},
}
STYLE_PROPERTIES = {
    'color', 'background-color', 'text-align', 'font-weight', 'font-style', 'text-decoration',
    'border', 'border-collapse', 'padding', 'margin', 'width', 'min-width', 'vertical-align',
}


def clean_html(value):
    """Keep the editor's formatting; drop scripts, event handlers, links and anything unknown."""
    if not value:
        return value
    return nh3.clean(value, tags=TAGS, attributes=ATTRIBUTES, filter_style_properties=STYLE_PROPERTIES,
                     link_rel=None, strip_comments=True)
