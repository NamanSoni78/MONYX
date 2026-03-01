
const fs = require('fs');
const JSZip = require('jszip');

async function test() {
    const mockProject = {
        id: 'p1',
        name: 'Test Project',
        tracks: [
            {
                id: 't1',
                name: 'Track 1',
                effects: [
                    { id: 'e1', type: 'reverb', enabled: true, wet: 0.5, params: { decay: 2 } }
                ],
                clips: []
            }
        ],
        buffers: []
    };

    console.log("Original Project Effects:", JSON.stringify(mockProject.tracks[0].effects));

    // Export Logic
    const zip = new JSZip();
    // Simulate blob removal for JSON
    const projectJson = {
        ...mockProject,
        buffers: mockProject.buffers.map((b) => ({ ...b, blob: undefined }))
    };
    zip.file('project.json', JSON.stringify(projectJson));
    const zipContent = await zip.generateAsync({ type: 'nodebuffer' });

    // Import Logic
    const loadedZip = await JSZip.loadAsync(zipContent);
    const jsonStr = await loadedZip.file('project.json').async('text');
    const parsed = JSON.parse(jsonStr);

    console.log("Imported Project Effects:", JSON.stringify(parsed.tracks[0].effects));

    if (parsed.tracks[0].effects.length === 1 && parsed.tracks[0].effects[0].type === 'reverb') {
        console.log("SUCCESS: Effects preserved.");
    } else {
        console.log("FAILURE: Effects lost.");
        process.exit(1);
    }
}

test().catch(e => {
    console.error(e);
    process.exit(1);
});
