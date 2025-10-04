import React, { useEffect, useState, useCallback, useRef } from "react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";

interface Artwork {
  id: number;
  title: string;
  place_of_origin: string;
  artist_display: string;
  inscriptions: string;
  date_start: number;
  date_end: number;
}

interface ApiResponse {
  pagination: {
    total_pages: number;
    current_page: number;
  };
  data: Artwork[];
}

const LOCAL_STORAGE_KEY = "hire_me";

const ArtworksTable: React.FC = () => {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [selected, setSelected] = useState<Record<number, Artwork>>({});
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const [selectionPanelOpen, setSelectionPanelOpen] = useState<boolean>(false);
  const [numberInput, setNumberInput] = useState<string>("");
  const [selectingMultiple, setSelectingMultiple] = useState<boolean>(false);
  const [progressCount, setProgressCount] = useState<number>(0);
  const [requestedCount, setRequestedCount] = useState<number>(0);

  const abortRef = useRef<AbortController | null>(null);

  const loadSelectedFromStorage = useCallback(() => {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, Artwork>;
      const mapped: Record<number, Artwork> = {};
      Object.keys(parsed).forEach((k) => {
        const n = Number(k);
        if (!Number.isNaN(n)) mapped[n] = parsed[k];
      });
      return mapped;
    } catch (err) {
      console.warn("Failed parsing saved selection, clearing it.", err);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return {};
    }
  }, []);

  useEffect(() => {
    setSelected(loadSelectedFromStorage());
  }, [loadSelectedFromStorage]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(selected));
  }, [selected]);

  const fetchPage = async (pageNum: number, signal?: AbortSignal) => {
    const url = `https://api.artic.edu/api/v1/artworks?page=${pageNum}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const json = (await res.json()) as ApiResponse;
    return json;
  };

  const fetchArtworks = useCallback(async (pageNum: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const json = await fetchPage(pageNum, controller.signal);
      setArtworks(json.data || []);
      setTotalPages(json.pagination?.total_pages || 0);
    } catch (err) {
      if ((err as any).name !== "AbortError") {
        console.error("Error fetching artworks:", err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArtworks(page);
    return () => {
      abortRef.current?.abort();
    };
  }, [page, fetchArtworks]);

  const isSelected = useCallback(
    (art: Artwork) => !!selected[art.id],
    [selected]
  );

  const toggleRow = (art: Artwork) => {
    setSelected((prev) => {
      const copy = { ...prev };
      if (copy[art.id]) delete copy[art.id];
      else copy[art.id] = art;
      return copy;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelected((prev) => {
      const copy = { ...prev };
      if (checked) artworks.forEach((art) => (copy[art.id] = art));
      else artworks.forEach((art) => delete copy[art.id]);
      return copy;
    });
  };

  const handleRowMultipleSelectionButtonClick = async () => {
    const target = Number(numberInput);
    if (!Number.isInteger(target) || target <= 0) return;

    setRequestedCount(target);
    setSelectingMultiple(true);
    setProgressCount(0);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const allSelected = { ...selected };
      let collected: Artwork[] = [];
      let pageToFetch = 1;
      let knownTotalPages = totalPages || Infinity;

      while (collected.length < target && pageToFetch <= knownTotalPages) {
        const json = await fetchPage(pageToFetch, controller.signal);
        if (!isFinite(knownTotalPages)) {
          knownTotalPages = json.pagination?.total_pages || Infinity;
          setTotalPages(json.pagination?.total_pages || 0);
        }

        const pageItems = json.data || [];
        collected = collected.concat(pageItems);
        setProgressCount(Math.min(collected.length, target));

        if (!pageItems.length) break;
        pageToFetch += 1;
      }

      const artworksToSelect = collected.slice(0, target);
      artworksToSelect.forEach((art) => (allSelected[art.id] = art));

      setSelected(allSelected);
      setSelectionPanelOpen(false);
    } catch (err) {
      if ((err as any).name !== "AbortError") {
        console.error("Error selecting across pages:", err);
      }
    } finally {
      setSelectingMultiple(false);
      setProgressCount(0);
      setRequestedCount(0);
    }
  };

  return (
    <div className='p-4'>
      <h2 className='text-xl font-semibold mb-4'>🎨 Artworks</h2>

      {loading && <p>Loading page {page}...</p>}

      <div className='overflow-x-auto border rounded'>
        <table className='min-w-full border-collapse text-sm'>
          <thead className='bg-gray-100'>
            <tr>
              <th className='border p-2 text-center'>
                <div className='flex items-center gap-x-2 relative'>
                  <input
                    type='checkbox'
                    checked={artworks.length > 0 && artworks.every(isSelected)}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                  <button onClick={() => setSelectionPanelOpen((p) => !p)}>
                    {selectionPanelOpen ? <FaChevronUp /> : <FaChevronDown />}
                  </button>

                  {selectionPanelOpen && (
                    <div className='absolute left-10 top-8 z-10 flex flex-col p-3 bg-white border shadow-lg gap-2 rounded w-64'>
                      <label className='text-sm font-medium'>
                        Enter number of rows to select across pages
                      </label>
                      <input
                        type='number'
                        min={1}
                        placeholder='e.g. 40'
                        value={numberInput}
                        className='px-2 py-1 border rounded outline-none'
                        onChange={(e) => setNumberInput(e.target.value)}
                        disabled={selectingMultiple}
                      />
                      <div className='flex gap-2'>
                        <button
                          className='bg-blue-500 text-white px-2 py-1 rounded disabled:opacity-60'
                          onClick={handleRowMultipleSelectionButtonClick}
                          disabled={selectingMultiple}
                        >
                          Select
                        </button>
                        <button
                          className='px-2 py-1 border rounded'
                          onClick={() => {
                            setNumberInput("");
                            setSelectionPanelOpen(false);
                          }}
                          disabled={selectingMultiple}
                        >
                          Cancel
                        </button>
                      </div>

                      {selectingMultiple && (
                        <div className='text-sm mt-1'>
                          Selecting {progressCount} of {requestedCount}...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </th>
              <th className='border p-2 text-left'>Title</th>
              <th className='border p-2 text-left'>Origin</th>
              <th className='border p-2 text-left'>Artist</th>
              <th className='border p-2 text-left'>Inscriptions</th>
              <th className='border p-2 text-left'>Start</th>
              <th className='border p-2 text-left'>End</th>
            </tr>
          </thead>

          <tbody>
            {artworks.map((art) => (
              <tr
                key={art.id}
                className={`hover:bg-gray-50 ${
                  isSelected(art) ? "bg-blue-50" : ""
                }`}
              >
                <td className='border p-2 text-center'>
                  <input
                    type='checkbox'
                    checked={isSelected(art)}
                    onChange={() => toggleRow(art)}
                  />
                </td>
                <td className='border p-2'>{art.title || "N/A"}</td>
                <td className='border p-2'>{art.place_of_origin || "N/A"}</td>
                <td className='border p-2'>{art.artist_display || "N/A"}</td>
                <td className='border p-2'>{art.inscriptions || "—"}</td>
                <td className='border p-2'>{art.date_start || "—"}</td>
                <td className='border p-2'>{art.date_end || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className='flex justify-center items-center gap-3 mt-4'>
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className='px-3 py-1 border rounded disabled:opacity-50'
        >
          Prev
        </button>
        <span>
          Page <strong>{page}</strong> of {totalPages || "?"}
        </span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={totalPages ? page === totalPages : false}
          className='px-3 py-1 border rounded disabled:opacity-50'
        >
          Next
        </button>
      </div>

      <div className='mt-6 bg-gray-50 p-3 rounded border'>
        <h3 className='font-semibold mb-2'>
          Selected Rows ({Object.keys(selected).length})
        </h3>
        <ul className='space-y-1 text-sm max-h-40 overflow-y-auto'>
          {Object.values(selected).map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ArtworksTable;
