export function ReportHtmlFrame({ title, html }: { title: string; html: string }) {
  return (
    <iframe
      className="report-v2-frame"
      title={title}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={html}
    />
  );
}
