export default function Loading() {
  return (
    <div className="flex justify-center py-20" role="status" aria-label="Loading">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4"
        style={{ borderColor: "rgba(244,196,48,0.25)", borderTopColor: "#F4C430" }}
      />
    </div>
  );
}
