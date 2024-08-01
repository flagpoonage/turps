import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import chokidar from 'chokidar';
import { exec } from 'child_process';

fs.rmSync('./out', { recursive: true, force: true });

function createHtmlTemplate(outputs) {
  performance.mark('template_start');
  const keys = Object.keys(outputs);
  const script = keys.find((a) => a.endsWith('.js'));
  const style = keys.find((a) => a.endsWith('.css'));

  fs.rmSync('./out/index.html', { force: true });

  const template = fs
    .readFileSync('./src/index.tpl.html', 'utf-8')
    .replace('{{SCRIPT}}', `/${path.basename(script)}`)
    .replace('{{STYLE}}', `/${path.basename(style)}`);

  fs.writeFileSync('./out/index.html', template);
  performance.mark('template_end');
  const time = Math.round(
    performance.measure('template_time', 'template_start', 'template_end')
      .duration,
  );
  performance.clearMarks();

  console.log(`Template finished in [${time}] milliseconds`);
}

const options = {
  entryPoints: ['./src/js/index.ts'],
  outdir: './out',
  bundle: true,
  entryNames: '[name].[hash]',
  metafile: true,
};

if (process.argv.includes('--once')) {
  performance.mark('build_start');
  const result = esbuild.buildSync(options);
  createHtmlTemplate(result.metafile.outputs);
  performance.mark('build_end');
  console.log(
    `Build finished in [${Math.round(performance.measure('build_time', 'build_start', 'build_end').duration)}] milliseconds`,
  );
} else {
  const port_flag = process.argv.find((a) => a.startsWith('--p='));
  const port_value = !port_flag ? 8080 : Number(port_flag.split('--p=')[1]);

  if (isNaN(port_value) || !port_value) {
    console.error(
      `Invalid port value specified [${port_value}]. Example usage "--p=1234"`,
    );
  }

  let initialized = false;
  let last_outputs = null;

  function initialize() {
    if (initialized || !last_outputs) {
      return;
    }

    const tpl_watcher = chokidar.watch('./src/index.tpl.html');
    tpl_watcher.on('change', () => createHtmlTemplate(last_outputs));

    exec(`npx http-server ./out -p ${port_value}`, { stdio: [0, 1, 2] });

    initialized = true;
  }

  esbuild
    .context({
      ...options,
      plugins: [
        {
          name: 'postbuild',
          setup(build) {
            build.onStart(() => {
              performance.mark('build_start');
            });

            build.onEnd((x) => {
              last_outputs = x.metafile.outputs;

              initialize();

              performance.mark('build_end');
              const m = performance.measure(
                'build_time',
                'build_start',
                'build_end',
              );
              console.log(
                `Build finished in [${Math.round(m.duration)}] milliseconds`,
              );
              performance.clearMarks();

              createHtmlTemplate(last_outputs);
            });
          },
        },
      ],
    })
    .then((x) => x.watch());
}
