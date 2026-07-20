// src/niimathOperators.json
var niimathOperators_default = {
  bandpass: {
    args: [
      "hp",
      "lp",
      "tr"
    ],
    help: "Butterworth filter, highpass and lowpass in Hz,TR in seconds (zero-phase 2*2nd order filtfilt)"
  },
  bitmap: {
    args: [
      "output.png"
    ],
    help: "create PNG bitmap from NIfTI volume",
    subOperations: {
      a: {
        args: [],
        help: "axial, coronal, sagittal at midpoint (0.5)"
      },
      m: {
        args: [],
        help: "mosaic view with slices at 0.25, 0.5, 0.75 for each axis"
      },
      o: {
        args: [],
        help: "automatically select largest plane orientation"
      },
      x: {
        args: [
          "val1"
        ],
        help: "sagittal slice(s) at specified position(s)"
      },
      y: {
        args: [
          "val1"
        ],
        help: "coronal slice(s) at specified position(s)"
      },
      z: {
        args: [
          "val1"
        ],
        help: "axial slice(s) at specified position(s)"
      },
      X: {
        args: [
          "vals"
        ],
        help: "same as -x/-y/-z but draw crosshairs from other axes"
      },
      r: {
        args: [],
        help: "insert row separator between slice groups"
      },
      f: {
        args: [],
        help: "flip left-right (0=neurological/default=1 radiological)"
      },
      u: {
        args: [],
        help: "show L/R labels (default=1)"
      },
      n: {
        args: [],
        help: "interpolation (0=nearest neighbor, 1=linear)"
      },
      s: {
        args: [
          "scale"
        ],
        help: "scale factor for output image size"
      },
      t: {
        args: [
          "min",
          "max"
        ],
        help: "intensity range for base image"
      },
      T: {
        args: [
          "min",
          "max"
        ],
        help: "intensity range for overlay image"
      },
      c: {
        args: [
          "R",
          "G",
          "B",
          "A"
        ],
        help: "base image RGBA tint (values 0.0-1.0)"
      },
      C: {
        args: [
          "R",
          "G",
          "B",
          "A"
        ],
        help: "overlay RGBA color (values 0.0-1.0)"
      },
      b: {
        args: [
          "R",
          "G",
          "B",
          "A"
        ],
        help: "background RGBA color (values 0.0-1.0)"
      },
      N: {
        args: [],
        help: "use negative colormap for overlay (blue-green for negative values)"
      },
      e: {
        args: [],
        help: "apply edge detection to overlay"
      }
    }
  },
  bptfm: {
    args: [
      "hp",
      "lp"
    ],
    help: "Same as bptf but does not remove mean (emulates fslmaths < 5.0.7)"
  },
  bwlabel: {
    args: [
      "conn"
    ],
    help: "Connected component labelling for non-zero voxels (conn sets neighbors: 6, 18, 26)"
  },
  c2h: {
    args: [],
    help: "reverse h2c transform"
  },
  ceil: {
    args: [],
    help: "round voxels upwards to the nearest integer"
  },
  ras: {
    args: [],
    help: "reorder and flip dimensions to RAS orientation"
  },
  conform: {
    args: [],
    help: "reslice to 1mm size in coronal slice direction with 256^3 voxels"
  },
  comply: {
    args: [
      "nx",
      "ny",
      "nz",
      "dx",
      "dy",
      "dz",
      "f_high",
      "isLinear"
    ],
    help: "conform to axial slice with dx*dy*dzmm size and dx*dy*dz voxels. f_high bright clamping (0.98 for top 2%). Linear (1) or nearest-neighbor (0)"
  },
  close: {
    args: [
      "thr",
      "dx1",
      "dx2"
    ],
    help: "morphological close that binarizes with `thr`, dilates with `dx1` and erodes with `dx2` (fills bubbles with `thr`)"
  },
  crop: {
    args: [
      "tmin",
      "tsize"
    ],
    help: "remove volumes, starts with 0 not 1! Inputting -1 for a size will set it to the full range"
  },
  dehaze: {
    args: [
      "mode"
    ],
    help: "set dark voxels to zero (mode 1..5; higher yields more surviving voxels)"
  },
  detrend: {
    args: [],
    help: "remove linear trend (and mean) from input"
  },
  demean: {
    args: [],
    help: "remove average signal across volumes (requires 4D input)"
  },
  dilate: {
    args: [
      "thr",
      "dx"
    ],
    help: "morphological bilate binarizes with `thr`, grows up to distance `dx`"
  },
  edt: {
    args: [],
    help: "estimate Euler Distance Transform (distance field). Assumes isotropic input"
  },
  edginess: {
    args: [],
    help: "compute scalar field of local vector contrast (Euclidean distance between each voxel and its neighbors; useful for RGB or multi-channel data)"
  },
  erode: {
    args: [
      "thr",
      "dx"
    ],
    help: "morphological erode binarizes with `thr`, shrinks within distance `dx`"
  },
  floor: {
    args: [],
    help: "round voxels downwards to the nearest integer"
  },
  gz: {
    args: [
      "mode"
    ],
    help: "NIfTI gzip mode (0=uncompressed, 1=compressed, else FSL environment; default -1)"
  },
  h2c: {
    args: [],
    help: "convert CT scans from 'Hounsfield' to 'Cormack' units to emphasize soft tissue contrast"
  },
  mesh: {
    args: [],
    help: "meshify requires 'd'ark, 'm'edium, 'b'right or numeric isosurface ('niimath bet -mesh -i d mesh.gii')",
    subOperations: {
      i: {
        args: [
          "isovalue"
        ],
        help: "'d'ark, 'm'edium, 'b'right or numeric isosurface"
      },
      a: {
        args: [
          "atlasFile"
        ],
        help: "roi based atlas to mesh"
      },
      b: {
        args: [
          "fillBubbles"
        ],
        help: "fill bubbles"
      },
      l: {
        args: [
          "onlyLargest"
        ],
        help: "only largest"
      },
      o: {
        args: [
          "originalMC"
        ],
        help: "original marching cubes"
      },
      q: {
        args: [
          "quality"
        ],
        help: "quality"
      },
      s: {
        args: [
          "postSmooth"
        ],
        help: "post smooth"
      },
      r: {
        args: [
          "reduceFraction"
        ],
        help: "reduce fraction"
      },
      v: {
        args: [
          "verbose"
        ],
        help: "verbose"
      }
    }
  },
  hollow: {
    args: [
      "threshold",
      "thickness"
    ],
    help: "hollow out a mesh"
  },
  mod: {
    args: [],
    help: "modulus fractional remainder - same as '-rem' but includes fractions"
  },
  otsu: {
    args: [
      "mode"
    ],
    help: "binarize image using Otsu's method (mode 1..5; higher yields more bright voxels)"
  },
  power: {
    args: [
      "exponent"
    ],
    help: "raise the current image by following exponent"
  },
  qform: {
    args: [
      "code"
    ],
    help: "set qform_code"
  },
  sform: {
    args: [
      "code"
    ],
    help: "set sform_code"
  },
  p: {
    args: [
      "threads"
    ],
    help: "set maximum number of parallel threads (0 = use all available)"
  },
  resize: {
    args: [
      "X",
      "Y",
      "Z",
      "m"
    ],
    help: "grow (>1) or shrink (<1) image. Method <m> (0=nearest,1=linear,2=spline,3=Lanczos,4=Mitchell)"
  },
  robustfov: {
    args: [],
    help: "crop to a robust field of view (default 170mm) from the top of the head down, removing lower head/neck (emulates FSL robustfov); adjusts dim and sform/qform"
  },
  round: {
    args: [],
    help: "round voxels to the nearest integer"
  },
  scale01: {
    args: [],
    help: "linearly rescale intensities to the range 0\u20131 using global min/max"
  },
  sedt: {
    args: [],
    help: "estimate signed Euler Distance Transform (distance field). Assumes isotropic input"
  },
  sobel: {
    args: [],
    help: "fast edge detection"
  },
  sobel_binary: {
    args: [],
    help: "sobel creating binary edge"
  },
  tensor_2lower: {
    args: [],
    help: "convert FSL style upper triangle image to NIfTI standard lower triangle order"
  },
  tensor_2upper: {
    args: [],
    help: "convert NIfTI standard lower triangle image to FSL style upper triangle order"
  },
  tensor_decomp_lower: {
    args: [],
    help: "as tensor_decomp except input stores lower diagonal (AFNI, ANTS, Camino convention)"
  },
  trunc: {
    args: [],
    help: "truncates the decimal value from floating point value and returns integer value"
  },
  unifize: {
    args: [],
    help: "bias field correction (adapted from AFNI 3dUnifize); optional -GM also scales gray matter"
  },
  unsharp: {
    args: [
      "sigma",
      "scl"
    ],
    help: "edge enhancing unsharp mask (sigma in mm, not voxels [1 is typical]; scl is amount [0.5 medium, 1.0 heavy])"
  },
  dog: {
    args: [
      "sPos",
      "sNeg"
    ],
    help: "difference of gaussian with zero-crossing edges (positive and negative sigma mm)"
  },
  dogr: {
    args: [
      "sPos",
      "sNeg"
    ],
    help: "as dog, without zero-crossing (raw rather than binarized data)"
  },
  dogx: {
    args: [
      "sPos",
      "sNeg"
    ],
    help: "as dog, zero-crossing for 2D sagittal slices"
  },
  dogy: {
    args: [
      "sPos",
      "sNeg"
    ],
    help: "as dog, zero-crossing for 2D coronal slices"
  },
  dogz: {
    args: [
      "sPos",
      "sNeg"
    ],
    help: "as dog, zero-crossing for 2D axial slices"
  },
  add: {
    args: [
      "input"
    ],
    help: "add following input to current image"
  },
  sub: {
    args: [
      "input"
    ],
    help: "subtract following input from current image"
  },
  mul: {
    args: [
      "input"
    ],
    help: "multiply current image by following input"
  },
  div: {
    args: [
      "input"
    ],
    help: "divide current image by following input"
  },
  rem: {
    args: [
      "number"
    ],
    help: "modulus remainder - divide current image by following input and take remainder"
  },
  thr: {
    args: [
      "number"
    ],
    help: "use following number to threshold current image (zero anything below the number)"
  },
  thrp: {
    args: [
      "input"
    ],
    help: "use following percentage (0-100) of ROBUST RANGE to threshold current image (zero anything below the number)"
  },
  thrP: {
    args: [
      "input"
    ],
    help: "use following percentage (0-100) of ROBUST RANGE of positive voxels and threshold below"
  },
  uthr: {
    args: [
      "number"
    ],
    help: "use following number to upper-threshold current image (zero anything above the number)"
  },
  uthrp: {
    args: [
      "input"
    ],
    help: "use following percentage (0-100) of ROBUST RANGE to upper-threshold current image (zero anything above the number)"
  },
  uthrP: {
    args: [
      "input"
    ],
    help: "use following percentage (0-100) of ROBUST RANGE of positive voxels and threshold above"
  },
  clamp: {
    args: [
      "input"
    ],
    help: "use following percentage (0-100) of ROBUST RANGE to threshold current image (anything below set to this threshold)"
  },
  uclamp: {
    args: [
      "input"
    ],
    help: "use following percentage (0-100) of ROBUST RANGE to threshold current image (anything above set to this threshold)"
  },
  max: {
    args: [
      "input"
    ],
    help: "take maximum of following input and current image"
  },
  min: {
    args: [
      "input"
    ],
    help: "take minimum of following input and current image"
  },
  seed: {
    args: [
      "number"
    ],
    help: "seed random number generator with following number"
  },
  save: {
    args: [],
    help: "save the current working image to the input filename"
  },
  inm: {
    args: [
      "mean"
    ],
    help: "(-i i ip.c) intensity normalisation (per 3D volume mean)"
  },
  ing: {
    args: [
      "mean"
    ],
    help: "(-I i ip.c) intensity normalisation, global 4D mean)"
  },
  s: {
    args: [
      "sigma"
    ],
    help: "create a gauss kernel of sigma mm and perform mean filtering"
  },
  exp: {
    args: [],
    help: "exponential"
  },
  log: {
    args: [],
    help: "natural logarithm"
  },
  sin: {
    args: [],
    help: "sine function"
  },
  cos: {
    args: [],
    help: "cosine function"
  },
  tan: {
    args: [],
    help: "tangent function"
  },
  asin: {
    args: [],
    help: "arc sine function"
  },
  acos: {
    args: [],
    help: "arc cosine function"
  },
  atan: {
    args: [],
    help: "arc tangent function"
  },
  sqr: {
    args: [],
    help: "square"
  },
  sqrt: {
    args: [],
    help: "square root"
  },
  recip: {
    args: [],
    help: "reciprocal (1/current image)"
  },
  abs: {
    args: [],
    help: "absolute value"
  },
  bin: {
    args: [],
    help: "use (current image>0) to binarise"
  },
  binv: {
    args: [],
    help: "binarise and invert (binarisation and logical inversion)"
  },
  fillh: {
    args: [],
    help: "fill holes in a binary mask (holes are internal - i.e. do not touch the edge of the FOV)"
  },
  fillh26: {
    args: [],
    help: "fill holes using 26 connectivity"
  },
  index: {
    args: [],
    help: "replace each nonzero voxel with a unique (subject to wrapping) index number"
  },
  grid: {
    args: [
      "value",
      "spacing"
    ],
    help: "add a 3D grid of intensity <value> with grid spacing <spacing>"
  },
  edge: {
    args: [],
    help: "edge strength"
  },
  tfce: {
    args: [
      "H",
      "E",
      "connectivity"
    ],
    help: "enhance with TFCE, e.g. -tfce 2 0.5 6 (maybe change 6 to 26 for skeletons)"
  },
  tfceS: {
    args: [
      "H",
      "E",
      "connectivity",
      "X",
      "Y",
      "Z",
      "tfce_thresh"
    ],
    help: "show support area for voxel (X,Y,Z)"
  },
  nan: {
    args: [],
    help: "replace NaNs (improper numbers) with 0"
  },
  nanm: {
    args: [],
    help: "make NaN (improper number) mask with 1 for NaN voxels, 0 otherwise"
  },
  rand: {
    args: [],
    help: "add uniform noise (range 0:1)"
  },
  randn: {
    args: [],
    help: "add Gaussian noise (mean=0 sigma=1)"
  },
  range: {
    args: [],
    help: "set the output calmin/max to full data range"
  },
  tensor_decomp: {
    args: [],
    help: "convert a 4D (6-timepoint )tensor image into L1,2,3,FA,MD,MO,V1,2,3 (remaining image in pipeline is FA)"
  },
  kernel: {
    subOperations: {
      "3D": {
        args: [],
        help: "3x3x3 box centered on target voxel (set as default kernel)"
      },
      "2D": {
        args: [],
        help: "3x3x1 box centered on target voxel"
      },
      box: {
        args: [
          "size"
        ],
        help: "all voxels in a cube of width <size> mm centered on target voxel"
      },
      boxv: {
        args: [
          "size"
        ],
        help: "all voxels in a cube of width <size> voxels centered on target voxel, CAUTION: size should be an odd number"
      },
      boxv3: {
        args: [
          "X",
          "Y",
          "Z"
        ],
        help: "all voxels in a cuboid of dimensions X x Y x Z centered on target voxel, CAUTION: size should be an odd number"
      },
      gauss: {
        args: [
          "sigma"
        ],
        help: "gaussian kernel (sigma in mm, not voxels)"
      },
      sphere: {
        args: [
          "size"
        ],
        help: "all voxels in a sphere of radius <size> mm centered on target voxel"
      },
      file: {
        args: [
          "filename"
        ],
        help: "use external file as kernel"
      }
    }
  },
  dilM: {
    args: [],
    help: "Mean Dilation of non-zero voxels"
  },
  dilD: {
    args: [],
    help: "Maximum Dilation of non-zero voxels (emulating output of fslmaths 6.0.1, max not modal)"
  },
  dilF: {
    args: [],
    help: "Maximum filtering of all voxels"
  },
  dilall: {
    args: [],
    help: "Apply -dilM repeatedly until the entire FOV is covered"
  },
  ero: {
    args: [],
    help: "Erode by zeroing non-zero voxels when zero voxels found in kernel"
  },
  eroF: {
    args: [],
    help: "Minimum filtering of all voxels"
  },
  fmedian: {
    args: [],
    help: "Median Filtering"
  },
  fmean: {
    args: [],
    help: "Mean filtering, kernel weighted (conventionally used with gauss kernel)"
  },
  fmeanu: {
    args: [],
    help: "Mean filtering, kernel weighted, un-normalized (gives edge effects)"
  },
  subsamp2: {
    args: [],
    help: "downsamples image by a factor of 2 (keeping new voxels centered on old)"
  },
  subsamp2offc: {
    args: [],
    help: "downsamples image by a factor of 2 (non-centered)"
  },
  Tmean: {
    args: [],
    help: "mean across time"
  },
  Tstd: {
    args: [],
    help: "standard deviation across time"
  },
  Tsum: {
    args: [],
    help: "sum across time"
  },
  Tmax: {
    args: [],
    help: "max across time"
  },
  Tmaxn: {
    args: [],
    help: "time index of max across time"
  },
  Tmin: {
    args: [],
    help: "min across time"
  },
  Tmedian: {
    args: [],
    help: "median across time"
  },
  Tperc: {
    args: [
      "percentage"
    ],
    help: "nth percentile (0-100) of FULL RANGE across time"
  },
  Tar1: {
    args: [],
    help: "temporal AR(1) coefficient (use -odt float and probably demean first)"
  },
  pval: {
    args: [],
    help: "Nonparametric uncorrected P-value, assuming timepoints are the permutations; first timepoint is actual (unpermuted) stats image"
  },
  pval0: {
    args: [],
    help: "Same as -pval, but treat zeros as missing data"
  },
  cpval: {
    args: [],
    help: "Same as -pval, but gives FWE corrected P-values"
  },
  ztop: {
    args: [],
    help: "Convert Z-stat to (uncorrected) P"
  },
  ptoz: {
    args: [],
    help: "Convert (uncorrected) P to Z"
  },
  ztopc: {
    args: [],
    help: "Convert Z-stat to (uncorrected but clamped) P"
  },
  ptozc: {
    args: [],
    help: "Convert (uncorrected but clamped) P to Z"
  },
  rank: {
    args: [],
    help: "Convert data to ranks (over T dim)"
  },
  ranknorm: {
    args: [],
    help: "Transform to Normal dist via ranks"
  },
  roi: {
    args: [
      "xmin",
      "xsize",
      "ymin",
      "ysize",
      "zmin",
      "zsize",
      "tmin",
      "tsize"
    ],
    help: "zero outside roi (using voxel coordinates). Inputting -1 for a size will set it to the full image extent for that dimension"
  },
  bptf: {
    args: [
      "hp_sigma",
      "lp_sigma"
    ],
    help: "(-t in ip.c) Bandpass temporal filtering; nonlinear highpass and Gaussian linear lowpass (with sigmas in volumes, not seconds); set either sigma<0 to skip that filter"
  },
  roc: {
    args: [
      "AROC-thresh",
      "outfile",
      "truth"
    ],
    help: "take (normally binary) truth and test current image in ROC analysis against truth. <AROC-thresh> is usually 0.05 and is limit of Area-under-ROC measure FP axis. <outfile> is a text file of the ROC curve (triplets of values: FP TP threshold). If the truth image contains negative voxels these get excluded from all calculations. If <AROC-thresh> is positive then the [4Dnoiseonly] option needs to be set, and the FP rate is determined from this noise-only data, and is set to be the fraction of timepoints where any FP (anywhere) is seen, as found in the noise-only 4d-dataset. This is then controlling the FWE rate. If <AROC-thresh> is negative the FP rate is calculated from the zero-value parts of the <truth> image, this time averaging voxelwise FP rate over all timepoints. In both cases the TP rate is the average fraction of truth=positive voxels correctly found"
  }
};

// src/core.ts
var dataTypes = {
  char: "char",
  short: "short",
  int: "int",
  float: "float",
  double: "double",
  input: "input"
};
var NiimathBase = class {
  constructor(operators, workerFactory) {
    // Single owner of the worker and the one in-flight operation. A worker processes one op at a
    // time (the API is awaited sequentially) and the owner ENFORCES that — a second concurrent op
    // is rejected, never silently interleaved. init(), run(), dispose(), and a fatal crash all
    // funnel through this owner, and every state change is scoped to the worker GENERATION so a
    // stale message from a replaced/disposed worker can never settle the current one.
    this.worker = null;
    this.ready = false;
    // the current worker has sent 'ready' (init resolved) and is usable
    this.pendingReject = null;
    this.outputDataType = "float";
    this.dataTypes = dataTypes;
    this.operators = operators;
    this.workerFactory = workerFactory;
  }
  init() {
    this.dispose("niimath worker replaced by a new init()");
    return new Promise((resolve, reject) => {
      let worker;
      try {
        worker = this.workerFactory();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      this.worker = worker;
      this.ready = false;
      this.pendingReject = reject;
      worker.onmessage = (event) => {
        if (this.worker !== worker) return;
        if (event.data && event.data.type === "ready") {
          this.ready = true;
          this.pendingReject = null;
          resolve(true);
        } else if (event.data && event.data.type === "error") {
          this._fail(worker, new Error(event.data.message || "niimath worker failed to initialize"));
        }
      };
      worker.onerror = (error) => {
        this._fail(worker, new Error(`Worker failed to load: ${error.message}`));
      };
    });
  }
  // Terminate the worker, release its WASM heap, AND reject any in-flight init()/run() so no
  // caller hangs (Worker.terminate() emits no event). Idempotent: safe before init(), after a
  // failure, or called repeatedly. A processor created earlier becomes non-runnable after this
  // (its next run() sees no ready worker and rejects with "not initialized").
  dispose(reason = "niimath worker disposed") {
    const worker = this.worker;
    const reject = this.pendingReject;
    this.worker = null;
    this.ready = false;
    this.pendingReject = null;
    worker?.terminate();
    reject?.(new Error(reason));
  }
  // Fatal error/crash for `worker`. If it is still the current worker, drop it and reject the
  // in-flight op (visible to EVERY ImageProcessor, since they all read this single owner); a
  // stale/superseded worker is just terminated. The one invalidation path for init and run.
  _fail(worker, error) {
    if (this.worker === worker) {
      const reject = this.pendingReject;
      this.worker = null;
      this.ready = false;
      this.pendingReject = null;
      worker.terminate();
      reject?.(error);
    } else {
      worker.terminate();
    }
  }
  // A capability handle for ImageProcessor: it never holds its own worker reference, so worker
  // ownership stays with this base. All operations are generation-scoped (worker identity) so a
  // stale event cannot settle/clobber a newer generation.
  _handle() {
    return {
      // Fail-fast: a run requires a READY, IDLE worker. Throwing here (with NO state mutation on
      // failure) prevents a pre-ready run, or a second overlapping run, from replacing the
      // in-flight op's handlers/rejecter. On success it registers `reject` and returns the worker.
      beginRun: (reject) => {
        if (this.worker === null || !this.ready) {
          throw new Error("Worker not initialized. Did you await the init() method?");
        }
        if (this.pendingReject !== null) {
          throw new Error("niimath is busy: await the previous run() before starting another");
        }
        this.pendingReject = reject;
        return this.worker;
      },
      // Clear the in-flight op ONLY if `worker` is still current — a late result from a
      // replaced/disposed worker must not clear the new worker's rejecter.
      settle: (worker) => {
        if (this.worker === worker) this.pendingReject = null;
      },
      isCurrent: (worker) => this.worker === worker,
      fail: (worker, error) => this._fail(worker, error)
    };
  }
  setOutputDataType(type) {
    if (Object.values(this.dataTypes).includes(type)) {
      this.outputDataType = type;
    } else {
      throw new Error(`Invalid data type: ${type}`);
    }
  }
  image(file) {
    return new ImageProcessor({
      handle: this._handle(),
      file,
      operators: this.operators,
      outputDataType: this.outputDataType
    });
  }
};
var ImageProcessor = class {
  constructor({ handle, file, operators, outputDataType }) {
    this.commands = [];
    // Files (besides the main input) staged into MEMFS by name for chain ops that
    // take filename argv tokens (e.g. -deface/-spm_deface template + mask).
    this.extraFiles = [];
    // Monotonic counter for generated staging names (collision-proof argv tokens).
    this.stagedCounter = 0;
    this.handle = handle;
    this.file = file;
    this.operators = operators;
    this.outputDataType = outputDataType ?? "float";
    this._generateMethods();
  }
  _addCommand(cmd, ...args) {
    this.commands.push(cmd, ...args.map(String));
    return this;
  }
  // Chain ops that take input filenames as argv tokens (template/mask/ref). The
  // generated fluent methods only handle scalar args, so these are special-cased.
  // Each File is staged into MEMFS under a GENERATED internal name (a unique
  // prefix + the original name, preserving the extension niimath uses to detect
  // gzip/format) and that name is emitted as the argv token. Generated names keep
  // a template/mask/ref whose File.name collides with the input, output, or
  // another staged file from shadowing or unlinking the wrong MEMFS entry.
  // Extra opts (e.g. '-cost', 'nmi') follow.
  _addFileCommand(flag, files, opts = []) {
    const names = files.map(
      (f) => `__nimx${this.stagedCounter++}_${f.name.replace(/[^A-Za-z0-9._-]/g, "_")}`
    );
    this.commands.push(flag, ...names, ...opts.map(String));
    this.extraFiles.push(...files.map((f, i) => ({ name: names[i], data: f })));
    return this;
  }
  // Affine defacing (BSD allineate): -deface <tmpl> <mask> [opts]
  // Opts follow the template/mask argv tokens, e.g. ['-cost', 'hel'] to select the
  // ordinary AFNI-style engine; omit for the default fast (SPM/FLIRT-inspired) engine.
  deface(tmpl, mask, opts = []) {
    return this._addFileCommand("-deface", [tmpl, mask], opts);
  }
  // SPM rigid-body defacing (GPL spm_coreg): -spm_deface <tmpl> <mask> [opts]
  spmDeface(tmpl, mask, opts = []) {
    return this._addFileCommand("-spm_deface", [tmpl, mask], opts);
  }
  // SPM rigid-body coregistration (GPL): -spm_coreg <ref> [opts]
  spmcoreg(ref, opts = []) {
    return this._addFileCommand("-spm_coreg", [ref], opts);
  }
  // Affine registration (BSD allineate): -allineate <base> [opts] [-weight <img>]
  // The optional `weight` is a base(fixed)-space GRADED weight image, AFNI 3dAllineate style (its
  // dims + world frame must match `base`): normalized to [0, 1] (divide by max) and used per base
  // voxel — a voxel weighted 0 is excluded, one near 1 dominates. It is NOT an exclusion mask; keep
  // the out-of-ROI head attenuated (nonzero) to anchor global scale (a fully-zeroed exterior lets a
  // cross-modal fit collapse into the scalp). It steers BOTH engines — the ordinary engine
  // (`-cost hel`/`lpc`/`lpa`/`ls`) uses it in place of its manufactured autoweight, the fast engine
  // applies it at the finest 2 mm stage only. It is rejected only with stdin and `-applymat`; when
  // the default fast engine falls back to the ordinary engine, the weight is still honored.
  // Emitted as `-weight <img>` after the base + opts and staged
  // into MEMFS like the other file operands.
  allineate(base, opts = [], weight) {
    this._addFileCommand("-allineate", [base], opts);
    if (weight) this._addFileCommand("-weight", [weight]);
    return this;
  }
  // Anonymization by face replacement (BSD allineate/reface): -reface <tmpl> <shell> <weight> [opts].
  // Registers the subject to `tmpl`, back-projects the signed template-space `shell` onto the
  // subject grid, and composites an anonymized image. All three file operands are REQUIRED (the
  // `weight` is reused as the registration weight); opts are the `-cost` tuning as for `deface`.
  // For privacy the coverage diagnostic fails closed (<10% mapped → the run errors, no output).
  reface(tmpl, shell, weight, opts = []) {
    return this._addFileCommand("-reface", [tmpl, shell, weight], opts);
  }
  // Nearest-neighbour reslice of the current image onto another image's grid:
  // -reslice_nn <ref>. (e.g. bring a conformed-space mask back to a native grid.)
  resliceNN(ref) {
    return this._addFileCommand("-reslice_nn", [ref]);
  }
  // Multiply the current image by another image: -mul <img>. The generated `mul`
  // only handles a scalar token; this stages a File operand into MEMFS.
  mulImage(img) {
    return this._addFileCommand("-mul", [img]);
  }
  _generateMethods() {
    Object.keys(this.operators).forEach((methodName) => {
      const definition = this.operators[methodName];
      if (methodName === "kernel") {
        Object.keys(definition.subOperations).forEach((subOpName) => {
          const subOpDefinition = definition.subOperations[subOpName];
          const kernelMethodName = `kernel${subOpName.charAt(0).toUpperCase() + subOpName.slice(1)}`;
          this[kernelMethodName] = (...args) => {
            if (args.length !== subOpDefinition.args.length) {
              throw new Error(`Expected ${subOpDefinition.args.length} arguments for kernel ${subOpName}, but got ${args.length}`);
            }
            return this._addCommand("-kernel", subOpName, ...args);
          };
        });
      } else if (methodName === "mesh") {
        this.mesh = (options = {}) => {
          const subCommands = [];
          Object.keys(options).forEach((subOptionKey) => {
            if (definition.subOperations[subOptionKey]) {
              const subOpDefinition = definition.subOperations[subOptionKey];
              const subOptionValue = options[subOptionKey];
              if (subOpDefinition.args.length > 0 && subOptionValue === void 0) {
                throw new Error(`Sub-option -${subOptionKey} requires a value.`);
              }
              subCommands.push(`-${subOptionKey}`);
              if (subOpDefinition.args.length > 0) {
                subCommands.push(subOptionValue);
              }
            } else {
              throw new Error(`Invalid sub-option -${subOptionKey} for mesh.`);
            }
          });
          return this._addCommand("-mesh", ...subCommands);
        };
      } else if (methodName === "bitmap") {
        this.bitmap = (outputPath, options = {}) => {
          const subCommands = [outputPath];
          Object.keys(options).forEach((subOptionKey) => {
            if (definition.subOperations[subOptionKey]) {
              const subOpDefinition = definition.subOperations[subOptionKey];
              const subOptionValue = options[subOptionKey];
              if (subOpDefinition.args.length > 0 && subOptionValue === void 0) {
                throw new Error(`Sub-option -${subOptionKey} requires a value.`);
              }
              subCommands.push(`-${subOptionKey}`);
              if (subOpDefinition.args.length > 0) {
                if (Array.isArray(subOptionValue)) {
                  subCommands.push(...subOptionValue);
                } else {
                  subCommands.push(subOptionValue);
                }
              }
            } else {
              throw new Error(`Invalid sub-option -${subOptionKey} for bitmap.`);
            }
          });
          return this._addCommand("-bitmap", ...subCommands);
        };
      } else {
        this[methodName] = (...args) => {
          const expectedArgs = definition.args?.length ?? 0;
          if (args.length < expectedArgs) {
            throw new Error(`Expected ${expectedArgs} arguments for ${methodName}, but got ${args.length}`);
          }
          return this._addCommand(`-${methodName}`, ...args);
        };
      }
    });
  }
  async run(outName = "output.nii") {
    return new Promise((resolve, reject) => {
      if (/[/\\]/.test(outName) || outName.split("/").includes("..") || outName.startsWith("__nimi_") || outName.startsWith("__nimx")) {
        reject(new Error(
          `invalid output name '${outName}': use a plain basename that does not contain a path separator or start with the reserved __nimi_/__nimx prefix`
        ));
        return;
      }
      let worker;
      try {
        worker = this.handle.beginRun(reject);
      } catch (e) {
        reject(e);
        return;
      }
      worker.onmessage = (e) => {
        if (!this.handle.isCurrent(worker)) return;
        const data = e.data;
        if (data.type === "error") {
          this.handle.settle(worker);
          reject(new Error(data.message));
        } else if ("blob" in data && "exitCode" in data) {
          this.handle.settle(worker);
          const { blob, exitCode } = data;
          if (exitCode === 0) {
            resolve(blob);
          } else {
            reject(new Error(`niimath processing failed with exit code ${exitCode}`));
          }
        }
      };
      worker.onerror = (error) => {
        this.handle.fail(worker, new Error(`niimath worker crashed during run: ${error.message}`));
      };
      try {
        const inName = `__nimi_${this.file.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
        const inputFile = new File([this.file], inName);
        const args = [inName, ...this.commands, outName, "-odt", this.outputDataType];
        const message = {
          blob: inputFile,
          cmd: args,
          outName,
          extraFiles: this.extraFiles
        };
        worker.postMessage(message);
      } catch (e) {
        this.handle.settle(worker);
        reject(e);
      }
    });
  }
};

// src/index.ts
var Niimath = class extends NiimathBase {
  constructor() {
    super(
      niimathOperators_default,
      () => new Worker(new URL("./worker.js", import.meta.url), { type: "module" })
    );
  }
};
export {
  Niimath,
  dataTypes
};
